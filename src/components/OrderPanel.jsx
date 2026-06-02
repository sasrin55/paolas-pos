import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill, lineTotal } from '../lib/bill-math.js';
import { SERVICE_MODES } from '../lib/config.js';
import {
  saveBill, saveBillItem, deleteBillItem,
} from '../data-layer/index.js';
import ManagerPinModal from './ManagerPinModal.jsx';
import { printKOT } from '../lib/print.js';

export default function OrderPanel({
  selectedTableId, onOpenMenu, onSplit, onPay,
}) {
  const { tables, bills, billItems, config, refreshAll } = useApp();
  const table = tables.find((t) => t.table_id === selectedTableId) || null;
  const bill = table?.active_bill_id ? bills.find((b) => b.bill_id === table.active_bill_id) : null;
  const items = useMemo(
    () => bill ? billItems.filter((x) => x.bill_id === bill.bill_id) : [],
    [bill, billItems]
  );

  const [pendingVoid, setPendingVoid] = useState(null);
  const [discountPctInput, setDiscountPctInput] = useState('');
  const [pendingDiscount, setPendingDiscount] = useState(null);

  const totals = useMemo(() => computeBill(items, {
    discount_pct: bill?.discount_pct || 0,
    comp_amount: bill?.comp_amount || 0,
    service_charge: config.service_charge,
    tax: config.tax,
    tender: 'cash',
  }), [items, bill, config]);

  const onChangeServiceMode = async (mode) => {
    if (!bill) return;
    await saveBill({ ...bill, service_mode: mode });
    await refreshAll();
  };

  const onChangePax = async (delta) => {
    if (!bill) return;
    const pax = Math.max(0, (bill.pax || 0) + delta);
    await saveBill({ ...bill, pax });
    await refreshAll();
  };

  const onFireKOT = async () => {
    if (!bill) return;
    const fresh = items.filter((x) => !x.sent_to_kitchen);
    if (!fresh.length) return;
    printKOT({ bill, items: fresh, restaurant: config.restaurant.name });
    for (const it of fresh) {
      await saveBillItem({ ...it, sent_to_kitchen: true });
    }
    await refreshAll();
  };

  const applyVoid = async (mgr) => {
    if (!pendingVoid) return;
    await deleteBillItem(pendingVoid.line_id);
    await refreshAll();
    setPendingVoid(null);
  };

  const applyDiscount = async (mgr) => {
    if (!bill) return;
    const pct = Math.max(0, Math.min(100, Number(pendingDiscount) || 0));
    await saveBill({ ...bill, discount_pct: pct });
    setPendingDiscount(null);
    setDiscountPctInput('');
    await refreshAll();
  };

  if (!table) {
    return (
      <aside className="w-full md:w-[420px] bg-paolas-panel border-l border-paolas-border flex flex-col">
        <div className="px-5 py-4 border-b border-paolas-border">
          <h2 className="text-lg font-semibold">Order</h2>
          <p className="text-sm text-gray-400 mt-1">No table selected</p>
        </div>
        <div className="flex-1 px-5 py-4 text-sm text-gray-500 italic">
          Tap a table on the left to open an order.
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-full md:w-[420px] bg-paolas-panel border-l border-paolas-border flex flex-col">
      <div className="px-5 py-4 border-b border-paolas-border">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{table.label}</h2>
          {bill && <span className="text-[11px] text-gray-400">{bill.bill_id}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-gray-400">{table.zone}</span>
          {bill ? (
            <>
              <span>·</span>
              <ServiceModePicker mode={bill.service_mode} onChange={onChangeServiceMode} />
              <span>·</span>
              <span className="text-gray-300">Pax</span>
              <button onClick={() => onChangePax(-1)} className="w-7 h-7 rounded bg-paolas-border">−</button>
              <span className="font-medium w-4 text-center">{bill.pax || 0}</span>
              <button onClick={() => onChangePax(+1)} className="w-7 h-7 rounded bg-paolas-border">+</button>
            </>
          ) : (
            <span className="text-gray-400">no open order</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-500 italic">
            Empty order. Pick items from the menu on the left.
          </div>
        ) : (
          <ul className="divide-y divide-paolas-border">
            {items.map((it) => (
              <li key={it.line_id} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.qty}× {it.item_name}</div>
                    {it.modifiers?.length > 0 && (
                      <div className="text-xs text-gray-400 truncate">
                        {it.modifiers.map((m) => m.name).join(', ')}
                      </div>
                    )}
                    {it.note && <div className="text-xs italic text-gray-400">“{it.note}”</div>}
                    {!it.sent_to_kitchen && <div className="text-[10px] uppercase text-amber-400 mt-1">new</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatPKR(lineTotal(it))}</div>
                    <button
                      onClick={() => setPendingVoid(it)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      void
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-3 border-t border-paolas-border space-y-2 text-sm">
        <Row label="Subtotal"          value={formatPKR(totals.subtotal)} />
        <Row label={`Discount${bill?.discount_pct ? ` (${bill.discount_pct}%)` : ''}`} value={'-' + formatPKR(totals.discount)} muted />
        <Row label="Comp"              value={'-' + formatPKR(totals.comp)} muted />
        <Row label="Service charge"    value={formatPKR(totals.service)} muted />
        <Row label="Tax"               value={formatPKR(totals.tax)} muted />
        <div className="border-t border-paolas-border pt-2 flex items-baseline justify-between">
          <span className="text-base font-semibold">Total</span>
          <span className="text-xl font-bold">{formatPKR(totals.total)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={onOpenMenu}
            disabled={!table}
            className="min-h-tap rounded-xl bg-paolas-border text-sm font-medium"
          >
            + Add items
          </button>
          <button
            onClick={onFireKOT}
            disabled={!items.some((x) => !x.sent_to_kitchen)}
            className="min-h-tap rounded-xl bg-paolas-border text-sm font-medium disabled:opacity-40"
          >
            Fire KOT
          </button>
          <input
            value={discountPctInput}
            onChange={(e) => setDiscountPctInput(e.target.value)}
            placeholder="% disc"
            type="number"
            className="min-h-tap px-3 rounded-xl bg-paolas-bg border border-paolas-border text-sm"
          />
          <button
            onClick={() => setPendingDiscount(discountPctInput)}
            disabled={!bill || !discountPctInput}
            className="min-h-tap rounded-xl bg-paolas-border text-sm font-medium disabled:opacity-40"
          >
            Apply discount
          </button>
          <button
            onClick={onSplit}
            disabled={!bill || items.length === 0}
            className="min-h-tap rounded-xl bg-paolas-border text-sm font-medium disabled:opacity-40"
          >
            Split
          </button>
          <button
            onClick={onPay}
            disabled={!bill || items.length === 0}
            className="min-h-tap rounded-xl bg-paolas-accent text-sm font-semibold disabled:opacity-40"
          >
            Pay & close
          </button>
        </div>
      </div>

      <ManagerPinModal
        open={!!pendingVoid}
        onClose={() => setPendingVoid(null)}
        action="void_item"
        bill_id={bill?.bill_id || ''}
        detail={pendingVoid ? `${pendingVoid.qty}× ${pendingVoid.item_name}` : ''}
        onApproved={applyVoid}
      />
      <ManagerPinModal
        open={pendingDiscount !== null}
        onClose={() => setPendingDiscount(null)}
        action="apply_discount"
        bill_id={bill?.bill_id || ''}
        detail={pendingDiscount ? `${pendingDiscount}% on ${table.label}` : ''}
        onApproved={applyDiscount}
      />
    </aside>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className={`flex items-baseline justify-between ${muted ? 'text-gray-400' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ServiceModePicker({ mode, onChange }) {
  return (
    <select
      value={mode}
      onChange={(e) => onChange(e.target.value)}
      className="bg-paolas-border text-white text-xs rounded px-2 py-1"
    >
      {SERVICE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}
