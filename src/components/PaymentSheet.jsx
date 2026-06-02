import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill } from '../lib/bill-math.js';
import { TENDER_TYPES, TENDER_LABEL } from '../lib/config.js';
import { newPaymentId, nowISO } from '../lib/id.js';
import { saveBill, savePayment, updateTable, appendAudit, saveCustomer, getCustomer } from '../data-layer/index.js';
import { printReceipt } from '../lib/print.js';

export default function PaymentSheet({ open, onClose, bill, onClosed }) {
  const { billItems, payments: allPayments, tables, config, currentUser, refreshAll } = useApp();
  const items = useMemo(() => bill ? billItems.filter((x) => x.bill_id === bill.bill_id) : [], [bill, billItems]);

  const [splits, setSplits] = useState([{ tender_type: 'cash', amount_pkr: 0 }]);
  const [done, setDone] = useState(false);

  const totalsPre = computeBill(items, {
    discount_pct: bill?.discount_pct, comp_amount: bill?.comp_amount,
    service_charge: config.service_charge, tax: config.tax,
    payments: splits.length && splits.some((s) => s.amount_pkr > 0) ? splits : null,
    tender: splits[0]?.tender_type || 'cash',
  });

  const paid = splits.reduce((s, x) => s + (Number(x.amount_pkr) || 0), 0);
  const remaining = Math.max(0, totalsPre.total - paid);
  const change = Math.max(0, paid - totalsPre.total);

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
    if (paid < totalsPre.total) return;
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
        tender_type: s.tender_type,
        amount_pkr: s.amount_pkr,
        time: nowISO(),
      });
    }

    const closed = {
      ...bill,
      time_closed: nowISO(),
      status: 'closed',
      subtotal: totalsPre.subtotal,
      discount: totalsPre.discount,
      comp: totalsPre.comp,
      service_charge: totalsPre.service,
      tax: totalsPre.tax,
      total: totalsPre.total,
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

    // Update the customer record (visit count, spend, loyalty) if attached.
    if (closed.customer_id) {
      const existing = await getCustomer(closed.customer_id);
      const earned = config.loyalty?.enabled
        ? Math.floor(totalsPre.total * (config.loyalty.points_per_pkr || 0))
        : 0;
      const next = {
        customer_id: closed.customer_id,
        phone: existing?.phone || closed.customer_phone || '',
        name: existing?.name || closed.customer_name || '',
        first_visit: existing?.first_visit || nowISO(),
        last_visit: nowISO(),
        visit_count: (existing?.visit_count || 0) + 1,
        total_spend_pkr: (existing?.total_spend_pkr || 0) + totalsPre.total,
        tags: existing?.tags || '',
        notes: existing?.notes || '',
        loyalty_points: (existing?.loyalty_points || 0) + earned,
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
            <div>Due <span className="font-semibold text-white">{formatPKR(totalsPre.total)}</span></div>
            <div className="text-xs text-gray-400">
              Paid {formatPKR(paid)} · {remaining > 0 ? `Remaining ${formatPKR(remaining)}` : `Change ${formatPKR(change)}`}
            </div>
          </div>
          <button
            onClick={closeBill}
            disabled={paid < totalsPre.total}
            className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
          >
            Close bill & print
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-paolas-border bg-paolas-bg p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(totalsPre.subtotal)}</span></div>
          {totalsPre.discount > 0 && <div className="flex justify-between text-gray-400"><span>Discount</span><span>-{formatPKR(totalsPre.discount)}</span></div>}
          {totalsPre.service > 0 && <div className="flex justify-between text-gray-400"><span>Service</span><span>{formatPKR(totalsPre.service)}</span></div>}
          {totalsPre.tax > 0 && <div className="flex justify-between text-gray-400"><span>Tax</span><span>{formatPKR(totalsPre.tax)}</span></div>}
          <div className="flex justify-between font-semibold border-t border-paolas-border pt-2 mt-2">
            <span>Total</span><span>{formatPKR(totalsPre.total)}</span>
          </div>
        </div>

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
