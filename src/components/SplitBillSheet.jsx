import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill, lineTotal } from '../lib/bill-math.js';
import { newBillId, newLineId, nowISO, todayISO } from '../lib/id.js';
import { saveBill, saveBillItem, deleteBillItem } from '../data-layer/index.js';

export default function SplitBillSheet({ open, onClose, bill }) {
  const { billItems, config, refreshAll, currentUser } = useApp();
  const items = useMemo(() => bill ? billItems.filter((x) => x.bill_id === bill.bill_id) : [], [bill, billItems]);
  const [mode, setMode] = useState('by-item'); // by-item | by-pax
  const [pax, setPax] = useState(2);
  const [picked, setPicked] = useState({}); // line_id → true

  if (!bill) return null;

  const totals = computeBill(items, {
    discount_pct: bill.discount_pct, comp_amount: bill.comp_amount,
    service_charge: config.service_charge, tax: config.tax,
  });

  const splitByItem = async () => {
    const moves = items.filter((it) => picked[it.line_id]);
    if (!moves.length) return;
    const newB = {
      ...bill,
      bill_id: newBillId(),
      time_opened: nowISO(),
      date: todayISO(),
      // share the table with the parent — both bills close independently
      pax: 0,
      discount_pct: 0,
      comp_amount: 0,
      status: 'open',
      split_parent_id: bill.bill_id,
    };
    await saveBill(newB);
    for (const it of moves) {
      // create a new line on the new bill, delete from old
      await saveBillItem({ ...it, line_id: newLineId(), bill_id: newB.bill_id });
      await deleteBillItem(it.line_id);
    }
    await refreshAll();
    onClose?.();
  };

  const splitByPax = () => {
    // by-pax = informational view only; we don't fork bills, we just compute
    // per-head amount and (Phase 6) accept multiple tenders summing to total.
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Split — ${bill.table_label || bill.table}`}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-300">Bill total {formatPKR(totals.total)}</div>
          {mode === 'by-item' ? (
            <button onClick={splitByItem} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
              Split selected to new bill
            </button>
          ) : (
            <button onClick={splitByPax} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
              Done
            </button>
          )}
        </div>
      }
    >
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <ModeBtn active={mode === 'by-item'} onClick={() => setMode('by-item')}>By item</ModeBtn>
          <ModeBtn active={mode === 'by-pax'} onClick={() => setMode('by-pax')}>By # people</ModeBtn>
        </div>

        {mode === 'by-item' ? (
          <ul className="divide-y divide-paolas-border">
            {items.map((it) => (
              <li key={it.line_id} className="py-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!picked[it.line_id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [it.line_id]: e.target.checked }))}
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">{it.qty}× {it.item_name}</div>
                    {it.modifiers?.length > 0 && (
                      <div className="text-xs text-gray-400">{it.modifiers.map((m) => m.name).join(', ')}</div>
                    )}
                  </div>
                </label>
                <div className="text-sm">{formatPKR(lineTotal(it))}</div>
              </li>
            ))}
            {items.length === 0 && <li className="py-4 text-sm text-gray-500 italic">No items.</li>}
          </ul>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm">People</span>
              <button onClick={() => setPax((p) => Math.max(2, p - 1))} className="w-10 h-10 rounded-lg bg-paolas-border text-xl">−</button>
              <span className="text-2xl font-semibold w-10 text-center">{pax}</span>
              <button onClick={() => setPax((p) => p + 1)} className="w-10 h-10 rounded-lg bg-paolas-border text-xl">+</button>
            </div>
            <div className="rounded-xl bg-paolas-bg border border-paolas-border p-4">
              <div className="text-sm text-gray-400">Per person</div>
              <div className="text-3xl font-bold">{formatPKR(Math.ceil(totals.total / pax))}</div>
              <div className="mt-2 text-xs text-gray-400">
                Tell each guest this amount. At payment, collect separate tenders that sum to {formatPKR(totals.total)}.
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ModeBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-tap px-4 py-2 rounded-lg text-sm font-medium ${active ? 'bg-paolas-accent' : 'bg-paolas-border'}`}
    >
      {children}
    </button>
  );
}
