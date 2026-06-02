import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill } from '../lib/bill-math.js';
import { newPaymentId, nowISO } from '../lib/id.js';
import { saveBill, savePayment, updateTable } from '../data-layer/index.js';
import { printReceipt } from '../lib/print.js';
import { STATES, EXCEPTIONS } from '../lib/lifecycle.js';
import { TENDER_TYPES, TENDER_LABEL } from '../lib/config.js';
import ManagerPinModal from './ManagerPinModal.jsx';

export default function BillHistorySheet({ open, onClose }) {
  const { bills, billItems, payments, tables, config, refreshAll } = useApp();
  const [selected, setSelected] = useState(null);
  const [pendingReprint, setPendingReprint] = useState(null);
  const [pendingRecall, setPendingRecall] = useState(null);
  const [refundEditor, setRefundEditor] = useState(null); // { bill, draft, tender }
  const [pendingRefund, setPendingRefund] = useState(null);

  // Only today's closed bills by default; descending by close time.
  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(() => bills
    .filter((b) => b.date === today && (b.status === STATES.SETTLED || b.status === STATES.VOID))
    .sort((a, b) => (b.time_closed || '').localeCompare(a.time_closed || '')), [bills, today]);

  const itemsFor = (b) => billItems.filter((x) => x.bill_id === b.bill_id);
  const paysFor  = (b) => payments.filter((x) => x.bill_id === b.bill_id);

  const doReprint = (b) => setPendingReprint(b);
  const runReprint = (b) => {
    const items = itemsFor(b);
    const totals = {
      subtotal: b.subtotal, discount: b.discount, comp: b.comp,
      service: b.service_charge, tax: b.tax, total: b.total,
    };
    printReceipt({
      bill: { ...b, fbr_invoice_number: b.fbr_invoice_number || '' },
      items,
      payments: paysFor(b),
      totals,
      restaurant: config.restaurant.name,
      config,
      fbr: config.fbr.enabled
        ? { enabled: true, invoice_number: b.fbr_invoice_number || `${config.fbr.fallback_invoice_prefix || 'POS'}-${b.bill_id}`, qr_data: '' }
        : { enabled: false },
    });
  };

  const runRecall = async (b) => {
    // Restore status to running, reattach to table if free.
    const t = tables.find((x) => x.table_id === b.table);
    if (t && t.status === 'free') {
      await updateTable({ ...t, status: 'occupied', active_bill_id: b.bill_id });
    }
    await saveBill({ ...b, status: STATES.RUNNING, time_closed: '' });
    await refreshAll();
    onClose?.();
  };

  const runRefund = async () => {
    if (!pendingRefund) return;
    const { bill, amount, tender } = pendingRefund;
    await savePayment({
      payment_id: newPaymentId(),
      bill_id: bill.bill_id,
      outlet_id: bill.outlet_id,
      tender_type: tender,
      amount_pkr: -Math.abs(amount),
      time: nowISO(),
      is_refund: true,
    });
    await refreshAll();
    setPendingRefund(null);
    setRefundEditor(null);
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Today's bills" wide>
        <div className="p-5">
          {list.length === 0 && <p className="text-sm text-gray-400 italic">No bills closed today yet.</p>}
          <ul className="divide-y divide-paolas-border">
            {list.map((b) => (
              <li key={b.bill_id} className="py-3 flex items-center justify-between gap-3">
                <button onClick={() => setSelected(selected?.bill_id === b.bill_id ? null : b)} className="text-left flex-1">
                  <div className="font-medium">{b.bill_id} · {b.table_label || b.service_mode}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(b.time_closed || b.time_opened).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    <span className={`uppercase tracking-wide ${b.status === STATES.VOID ? 'text-red-400' : 'text-emerald-400'}`}>{b.status}</span>
                    {' · '}
                    {formatPKR(b.total || 0)}
                    {b.customer_name && <> · 👤 {b.customer_name}</>}
                  </div>
                </button>
                <div className="flex gap-2">
                  <button onClick={() => doReprint(b)} className="min-h-tap px-3 rounded-lg bg-paolas-border text-xs">Reprint</button>
                  <button onClick={() => setRefundEditor({ bill: b, draft: String(b.total || 0), tender: paysFor(b)[0]?.tender_type || 'cash' })} disabled={b.status === STATES.VOID} className="min-h-tap px-3 rounded-lg bg-amber-900/40 border border-amber-600/40 text-xs disabled:opacity-40">Refund</button>
                  <button onClick={() => setPendingRecall(b)} disabled={b.status === STATES.VOID} className="min-h-tap px-3 rounded-lg bg-paolas-border text-xs disabled:opacity-40">Recall</button>
                </div>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="mt-4 rounded-xl border border-paolas-border bg-paolas-bg p-4 text-sm">
              <div className="font-medium mb-2">{selected.bill_id}</div>
              <ul className="space-y-1">
                {itemsFor(selected).map((it) => (
                  <li key={it.line_id} className="flex justify-between">
                    <span>{it.qty}× {it.item_name}</span>
                    <span>{formatPKR(it.line_total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-paolas-border pt-2 space-y-0.5">
                {paysFor(selected).map((p) => (
                  <div key={p.payment_id} className={`flex justify-between text-xs ${p.amount_pkr < 0 ? 'text-amber-300' : 'text-gray-300'}`}>
                    <span>{TENDER_LABEL[p.tender_type] || p.tender_type}{p.is_refund && ' (refund)'}</span>
                    <span>{formatPKR(p.amount_pkr)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Refund editor */}
      {refundEditor && (
        <Modal open onClose={() => setRefundEditor(null)} title={`Refund — ${refundEditor.bill.bill_id}`}>
          <div className="p-5 space-y-3 text-sm">
            <label className="block">
              <span className="text-xs text-gray-400">Amount (PKR)</span>
              <input
                type="number"
                value={refundEditor.draft}
                onChange={(e) => setRefundEditor((o) => ({ ...o, draft: e.target.value }))}
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Refund tender</span>
              <select
                value={refundEditor.tender}
                onChange={(e) => setRefundEditor((o) => ({ ...o, tender: e.target.value }))}
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              >
                {TENDER_TYPES.map((t) => <option key={t} value={t}>{TENDER_LABEL[t]}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefundEditor(null)} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
              <button
                onClick={() => setPendingRefund({ bill: refundEditor.bill, amount: Number(refundEditor.draft) || 0, tender: refundEditor.tender })}
                className="min-h-tap px-4 py-2 rounded-lg bg-amber-700 font-semibold"
              >
                Approve (manager)
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ManagerPinModal
        open={!!pendingReprint}
        onClose={() => setPendingReprint(null)}
        action="reprint_receipt"
        bill_id={pendingReprint?.bill_id || ''}
        detail={pendingReprint ? `${pendingReprint.bill_id} · ${formatPKR(pendingReprint.total || 0)}` : ''}
        requireReason
        onApproved={() => { runReprint(pendingReprint); setPendingReprint(null); }}
      />
      <ManagerPinModal
        open={!!pendingRecall}
        onClose={() => setPendingRecall(null)}
        action="recall_bill"
        bill_id={pendingRecall?.bill_id || ''}
        detail={pendingRecall ? `${pendingRecall.bill_id} → reopen for editing` : ''}
        requireReason
        onApproved={() => runRecall(pendingRecall)}
      />
      <ManagerPinModal
        open={!!pendingRefund}
        onClose={() => setPendingRefund(null)}
        action="refund"
        bill_id={pendingRefund?.bill?.bill_id || ''}
        detail={pendingRefund ? `${formatPKR(pendingRefund.amount)} via ${pendingRefund.tender}` : ''}
        requireReason
        onApproved={runRefund}
      />
    </>
  );
}
