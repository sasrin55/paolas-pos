import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill } from '../lib/bill-math.js';
import { TENDER_TYPES, TENDER_LABEL } from '../lib/config.js';
import { newPaymentId, nowISO } from '../lib/id.js';
import { saveBill, savePayment, updateTable, appendAudit, saveCustomer, getCustomer } from '../data-layer/index.js';
import { printReceipt } from '../lib/print.js';
import { STATES } from '../lib/lifecycle.js';

export default function PaymentSheet({ open, onClose, bill, onClosed }) {
  const { billItems, payments: allPayments, tables, customers, config, currentUser, refreshAll } = useApp();
  const items = useMemo(() => bill ? billItems.filter((x) => x.bill_id === bill.bill_id) : [], [bill, billItems]);

  const [splits, setSplits] = useState([{ tender_type: 'cash', amount_pkr: 0 }]);
  const [tip, setTip] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [done, setDone] = useState(false);

  // Attached customer (if any) and their loyalty balance — needed for the
  // redemption row in the totals box.
  const attachedCustomer = bill?.customer_id
    ? customers.find((c) => c.customer_id === bill.customer_id)
    : null;
  const loyaltyAvailable = attachedCustomer?.loyalty_points || 0;
  const pkrPerPoint = config.loyalty?.pkr_per_point || 1;
  const redeemPoints = Math.min(Math.max(0, Math.floor(Number(pointsToRedeem) || 0)), loyaltyAvailable);
  const redeemPkr    = redeemPoints * pkrPerPoint;

  const totalsPre = computeBill(items, {
    discount_pct: bill?.discount_pct, comp_amount: bill?.comp_amount,
    loyalty_redeemed_pkr: redeemPkr,
    service_charge: config.service_charge, tax: config.tax,
    payments: splits.length && splits.some((s) => s.amount_pkr > 0) ? splits : null,
    tender: splits[0]?.tender_type || 'cash',
  });

  const grandTotal = totalsPre.total + Number(tip || 0);

  const paid = splits.reduce((s, x) => s + (Number(x.amount_pkr) || 0), 0);
  const remaining = Math.max(0, grandTotal - paid);
  const change = Math.max(0, paid - grandTotal);

  // House-account special handling: needs a customer attached.
  const usesHouseAccount = splits.some((s) => s.tender_type === 'house-account' && s.amount_pkr > 0);
  const houseAccountBlocked = usesHouseAccount && !bill?.customer_id;

  if (!bill) return null;

  const addSplit = () => setSplits((s) => [...s, { tender_type: 'card', amount_pkr: 0 }]);
  const setSplit = (idx, patch) => setSplits((s) => s.map((x, i) => i === idx ? { ...x, ...patch } : x));
  const rmSplit  = (idx) => setSplits((s) => s.filter((_, i) => i !== idx));
  const setOneTo = (idx, amt) => setSplits((s) => s.map((x, i) => i === idx ? { ...x, amount_pkr: amt } : x));

  const fbrForReceipt = config.fbr.enabled ? {
    enabled: true,
    invoice_number: config.fbr.integration_live ? '' : `${config.fbr.fallback_invoice_prefix || 'POS'}-${bill.bill_id}`,
    qr_data: config.fbr.integration_live ? '' : '',
  } : { enabled: false };

  const closeBill = async () => {
    if (paid < grandTotal || houseAccountBlocked) return;
    // Round splits to clear any change to the last tender
    const usedSplits = splits.map((s, i) => i === splits.length - 1
      ? { ...s, amount_pkr: s.amount_pkr - change }
      : s
    );

    for (const s of usedSplits) {
      if (s.amount_pkr <= 0) continue;
      await savePayment({
        payment_id: newPaymentId(),
        bill_id: bill.bill_id,
        outlet_id: bill.outlet_id,
        tender_type: s.tender_type,
        amount_pkr: s.amount_pkr,
        time: nowISO(),
      });
    }

    const closed = {
      ...bill,
      time_closed: nowISO(),
      status: STATES.SETTLED,
      subtotal: totalsPre.subtotal,
      discount: totalsPre.discount,
      comp: totalsPre.comp,
      loyalty_redeemed_pkr: totalsPre.loyalty,
      loyalty_redeemed_points: redeemPoints,
      service_charge: totalsPre.service,
      tax: totalsPre.tax,
      tip_pkr: Number(tip || 0),
      total: grandTotal,
      fbr_invoice_number: fbrForReceipt.invoice_number || '',
    };
    await saveBill(closed);

    const t = tables.find((x) => x.table_id === bill.table);
    if (t) await updateTable({ ...t, status: 'free', active_bill_id: null });

    await appendAudit({
      time: nowISO(),
      user_id: currentUser?.user_id || '',
      action: 'close_bill',
      bill_id: bill.bill_id,
      detail: `${formatPKR(totalsPre.total)} via ${usedSplits.filter((s) => s.amount_pkr > 0).map((s) => s.tender_type).join('+')}`,
    });

    // Update the customer record (visit count, spend, loyalty, house-account) if attached.
    if (closed.customer_id) {
      const existing = await getCustomer(closed.customer_id);
      const earned = config.loyalty?.enabled
        ? Math.floor(grandTotal * (config.loyalty.points_per_pkr || 0))
        : 0;
      // House-account amount adds to the running balance (they pay it later).
      const houseAddition = usedSplits
        .filter((s) => s.tender_type === 'house-account' && s.amount_pkr > 0)
        .reduce((s, x) => s + x.amount_pkr, 0);
      const next = {
        customer_id: closed.customer_id,
        outlet_id: bill.outlet_id,
        phone: existing?.phone || closed.customer_phone || '',
        name: existing?.name || closed.customer_name || '',
        first_visit: existing?.first_visit || nowISO(),
        last_visit: nowISO(),
        visit_count: (existing?.visit_count || 0) + 1,
        total_spend_pkr: (existing?.total_spend_pkr || 0) + grandTotal,
        tags: existing?.tags || '',
        notes: existing?.notes || '',
        loyalty_points: Math.max(0, (existing?.loyalty_points || 0) - redeemPoints + earned),
        house_account_balance: (existing?.house_account_balance || 0) + houseAddition,
      };
      await saveCustomer(next);
    }

    printReceipt({
      bill: closed,
      items,
      payments: usedSplits.filter((s) => s.amount_pkr > 0),
      totals: totalsPre,
      restaurant: config.restaurant.name,
      config,
      fbr: fbrForReceipt,
    });

    await refreshAll();
    setDone(true);
    onClosed?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Payment — ${bill.table_label || bill.table}`}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div>Due <span className="font-semibold text-white">{formatPKR(grandTotal)}</span></div>
            <div className="text-xs text-gray-400">
              Paid {formatPKR(paid)} · {remaining > 0 ? `Remaining ${formatPKR(remaining)}` : `Change ${formatPKR(change)}`}
            </div>
            {houseAccountBlocked && (
              <div className="text-xs text-red-400 mt-1">Attach a customer to use house-account.</div>
            )}
          </div>
          <button
            onClick={closeBill}
            disabled={paid < grandTotal || houseAccountBlocked}
            className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
          >
            Settle & print
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-paolas-border bg-paolas-bg p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(totalsPre.subtotal)}</span></div>
          {totalsPre.discount > 0 && <div className="flex justify-between text-gray-400"><span>Discount</span><span>-{formatPKR(totalsPre.discount)}</span></div>}
          {totalsPre.comp > 0 && <div className="flex justify-between text-gray-400"><span>Comp</span><span>-{formatPKR(totalsPre.comp)}</span></div>}
          {totalsPre.loyalty > 0 && <div className="flex justify-between text-gray-400"><span>Loyalty ({redeemPoints} pts)</span><span>-{formatPKR(totalsPre.loyalty)}</span></div>}
          {totalsPre.service > 0 && <div className="flex justify-between text-gray-400"><span>Service</span><span>{formatPKR(totalsPre.service)}</span></div>}
          {totalsPre.tax > 0 && <div className="flex justify-between text-gray-400"><span>Tax</span><span>{formatPKR(totalsPre.tax)}</span></div>}
          <div className="flex justify-between border-t border-paolas-border pt-2 mt-2"><span>Subtotal</span><span>{formatPKR(totalsPre.total)}</span></div>
          <div className="flex items-center justify-between mt-2 gap-2">
            <span>Tip</span>
            <div className="flex items-center gap-2">
              {[0, 0.05, 0.10, 0.15].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setTip(Math.round(totalsPre.total * pct))}
                  className="text-xs px-2 py-1 rounded bg-paolas-border"
                >
                  {pct === 0 ? 'none' : `${Math.round(pct * 100)}%`}
                </button>
              ))}
              <input
                type="number"
                value={tip || ''}
                onChange={(e) => setTip(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-24 min-h-tap px-2 py-1 rounded bg-paolas-bg border border-paolas-border text-right text-sm"
              />
            </div>
          </div>
          <div className="flex justify-between font-semibold border-t border-paolas-border pt-2 mt-2">
            <span>Total due</span><span>{formatPKR(grandTotal)}</span>
          </div>
        </div>

        {attachedCustomer && config.loyalty?.enabled && loyaltyAvailable > 0 && (
          <div className="rounded-xl border border-paolas-border bg-paolas-bg p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">Loyalty redemption</div>
                <div className="text-xs text-gray-400">
                  {attachedCustomer.name || attachedCustomer.phone} has <span className="text-white">{loyaltyAvailable}</span> points
                  {' ('}1 pt = {formatPKR(pkrPerPoint)}{')'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={pointsToRedeem || ''}
                  onChange={(e) => setPointsToRedeem(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 min-h-tap px-2 py-1 rounded bg-paolas-panel border border-paolas-border text-right text-sm"
                />
                <button onClick={() => setPointsToRedeem(loyaltyAvailable)} className="text-xs px-2 py-1 rounded bg-paolas-border">Use all</button>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Tenders</h4>
            <button onClick={addSplit} className="text-sm text-paolas-accent">+ Add split</button>
          </div>
          {splits.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
              <select
                value={s.tender_type}
                onChange={(e) => setSplit(i, { tender_type: e.target.value })}
                className="col-span-5 min-h-tap rounded-lg bg-paolas-bg border border-paolas-border px-3 py-2"
              >
                {TENDER_TYPES.map((t) => <option key={t} value={t}>{TENDER_LABEL[t]}</option>)}
              </select>
              <input
                type="number"
                value={s.amount_pkr || ''}
                onChange={(e) => setSplit(i, { amount_pkr: Number(e.target.value) || 0 })}
                placeholder="0"
                className="col-span-5 min-h-tap rounded-lg bg-paolas-bg border border-paolas-border px-3 py-2 text-right"
              />
              {splits.length > 1 ? (
                <button onClick={() => rmSplit(i)} className="col-span-2 min-h-tap rounded-lg bg-paolas-border">✕</button>
              ) : (
                <button
                  onClick={() => setOneTo(i, totalsPre.total)}
                  className="col-span-2 min-h-tap rounded-lg bg-paolas-border text-xs"
                  title="Fill exact amount"
                >
                  Exact
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500 mt-2">
            Tip: for split-by-pax, add one tender per person.
          </p>
        </div>

        {done && (
          <div className="text-sm text-emerald-400">
            Closed. Receipt sent to printer.
          </div>
        )}
      </div>
    </Modal>
  );
}
