import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { computeBill, lineTotal } from '../lib/bill-math.js';
import { SERVICE_MODES } from '../lib/config.js';
import {
  saveBill, saveBillItem, deleteBillItem, updateTable,
} from '../data-layer/index.js';
import ManagerPinModal from './ManagerPinModal.jsx';
import { printKOT } from '../lib/print.js';
import { STATES } from '../lib/lifecycle.js';

export default function OrderPanel({
  selectedTableId, activeBillId, onOpenMenu, onSplit, onPay, onAttachCustomer, onReplaceLine,
}) {
  const { tables, bills, billItems, config, refreshAll } = useApp();
  const table = tables.find((t) => t.table_id === selectedTableId) || null;
  // For takeaway/delivery: bill is referenced directly by activeBillId (no table)
  const bill = activeBillId
    ? bills.find((b) => b.bill_id === activeBillId)
    : (table?.active_bill_id ? bills.find((b) => b.bill_id === table.active_bill_id) : null);
  const items = useMemo(
    () => bill ? billItems.filter((x) => x.bill_id === bill.bill_id) : [],
    [bill, billItems]
  );

  const [pendingVoid, setPendingVoid] = useState(null);
  const [pendingVoidBill, setPendingVoidBill] = useState(false);
  const [discountPctInput, setDiscountPctInput] = useState('');
  const [pendingDiscount, setPendingDiscount] = useState(null);
  const [pendingOverride, setPendingOverride] = useState(null); // { line, new_price }
  const [overrideEditor, setOverrideEditor] = useState(null);   // { line, draft }
  const [pendingReduce, setPendingReduce] = useState(null);     // { line, new_qty }
  const [reduceEditor, setReduceEditor] = useState(null);       // { line, draft }
  const [lineMenuFor, setLineMenuFor] = useState(null);         // line whose menu is open

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
        <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
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
        {bill && (
          <button
            onClick={onAttachCustomer}
            className="mt-2 w-full min-h-tap text-left text-xs px-3 py-2 rounded-lg bg-paolas-border/60 hover:bg-paolas-border"
          >
            {bill.customer_id
              ? <span>👤 {bill.customer_name || bill.customer_phone} <span className="text-gray-400 ml-1">(change)</span></span>
              : <span className="text-gray-300">+ Attach customer (phone)</span>}
          </button>
        )}
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
                    {it.price_overridden && (
                      <div className="text-[10px] uppercase text-amber-300 mt-1">price overridden</div>
                    )}
                    {!it.sent_to_kitchen && <div className="text-[10px] uppercase text-amber-400 mt-1">new</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatPKR(lineTotal(it))}</div>
                    <div className="relative">
                      <button
                        onClick={() => setLineMenuFor(lineMenuFor === it.line_id ? null : it.line_id)}
                        className="text-xs text-gray-300 hover:text-white px-2 py-0.5 rounded hover:bg-paolas-border"
                      >
                        actions ▾
                      </button>
                      {lineMenuFor === it.line_id && (
                        <div className="absolute right-0 z-10 mt-1 w-40 bg-paolas-bg border border-paolas-border rounded-lg shadow-xl text-left">
                          <LineMenuItem onClick={() => { setReduceEditor({ line: it, draft: String(it.qty) }); setLineMenuFor(null); }}>
                            Reduce qty
                          </LineMenuItem>
                          <LineMenuItem onClick={() => { onReplaceLine?.(it); setLineMenuFor(null); }}>
                            Replace item
                          </LineMenuItem>
                          <LineMenuItem onClick={() => { setOverrideEditor({ line: it, draft: String(it.unit_price) }); setLineMenuFor(null); }}>
                            Override price
                          </LineMenuItem>
                          <LineMenuItem danger onClick={() => { setPendingVoid(it); setLineMenuFor(null); }}>
                            Void
                          </LineMenuItem>
                        </div>
                      )}
                    </div>
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
            disabled={!bill && !table}
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
            onClick={async () => {
              if (!bill) return;
              if (bill.status !== STATES.DUE) await saveBill({ ...bill, status: STATES.DUE });
              await refreshAll();
              onPay();
            }}
            disabled={!bill || items.length === 0}
            className="min-h-tap rounded-xl bg-paolas-accent text-sm font-semibold disabled:opacity-40"
          >
            Pay & close
          </button>
          <button
            onClick={() => setPendingVoidBill(true)}
            disabled={!bill}
            className="col-span-2 min-h-tap rounded-xl bg-red-900/40 border border-red-700/60 text-red-200 text-sm disabled:opacity-40"
          >
            Void whole bill
          </button>
        </div>
      </div>

      <ManagerPinModal
        open={!!pendingVoid}
        onClose={() => setPendingVoid(null)}
        action="void_item"
        bill_id={bill?.bill_id || ''}
        detail={pendingVoid ? `${pendingVoid.qty}× ${pendingVoid.item_name}` : ''}
        requireReason
        onApproved={applyVoid}
      />
      <ManagerPinModal
        open={pendingVoidBill}
        onClose={() => setPendingVoidBill(false)}
        action="void_bill"
        bill_id={bill?.bill_id || ''}
        detail={bill ? `Void entire bill (${items.length} item${items.length === 1 ? '' : 's'}, ${formatPKR(totals.total)})` : ''}
        requireReason
        onApproved={async () => {
          if (!bill) return;
          for (const it of items) await deleteBillItem(it.line_id);
          await saveBill({ ...bill, status: STATES.VOID, time_closed: new Date().toISOString() });
          if (table) await updateTable({ ...table, status: 'free', active_bill_id: null });
          setPendingVoidBill(false);
          await refreshAll();
        }}
      />
      <ManagerPinModal
        open={pendingDiscount !== null}
        onClose={() => setPendingDiscount(null)}
        action="apply_discount"
        bill_id={bill?.bill_id || ''}
        detail={pendingDiscount ? `${pendingDiscount}% on ${table?.label || bill?.bill_id}` : ''}
        onApproved={applyDiscount}
      />

      {/* Reduce qty editor */}
      {reduceEditor && (
        <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center" onClick={() => setReduceEditor(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div onClick={(e) => e.stopPropagation()} className="relative z-10 bg-paolas-panel border border-paolas-border rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5">
            <h3 className="text-lg font-semibold mb-2">Reduce quantity</h3>
            <p className="text-sm text-gray-400 mb-3">{reduceEditor.line.item_name} (currently {reduceEditor.line.qty})</p>
            <label className="block text-xs text-gray-400">New qty</label>
            <input
              type="number"
              min="0"
              value={reduceEditor.draft}
              onChange={(e) => setReduceEditor((o) => ({ ...o, draft: e.target.value }))}
              className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReduceEditor(null)} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
              <button
                onClick={() => {
                  const q = Math.max(0, Math.floor(Number(reduceEditor.draft) || 0));
                  if (q >= reduceEditor.line.qty) { setReduceEditor(null); return; }
                  setPendingReduce({ line: reduceEditor.line, new_qty: q });
                }}
                className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold"
              >
                Approve (manager)
              </button>
            </div>
          </div>
        </div>
      )}
      <ManagerPinModal
        open={!!pendingReduce}
        onClose={() => { setPendingReduce(null); setReduceEditor(null); }}
        action="reduce_item"
        bill_id={bill?.bill_id || ''}
        detail={pendingReduce ? `${pendingReduce.line.item_name}: ${pendingReduce.line.qty} → ${pendingReduce.new_qty}` : ''}
        requireReason
        onApproved={async () => {
          if (!pendingReduce) return;
          if (pendingReduce.new_qty === 0) {
            await deleteBillItem(pendingReduce.line.line_id);
          } else {
            const next = { ...pendingReduce.line, qty: pendingReduce.new_qty };
            next.line_total = lineTotal(next);
            await saveBillItem(next);
          }
          setPendingReduce(null);
          setReduceEditor(null);
          await refreshAll();
        }}
      />

      {/* Price override editor: type new price, then approve via manager PIN */}
      {overrideEditor && (
        <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center" onClick={() => setOverrideEditor(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div onClick={(e) => e.stopPropagation()} className="relative z-10 bg-paolas-panel border border-paolas-border rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5">
            <h3 className="text-lg font-semibold mb-2">Override price</h3>
            <p className="text-sm text-gray-400 mb-3">{overrideEditor.line.qty}× {overrideEditor.line.item_name}</p>
            <label className="block text-xs text-gray-400">New unit price (PKR)</label>
            <input
              type="number"
              value={overrideEditor.draft}
              onChange={(e) => setOverrideEditor((o) => ({ ...o, draft: e.target.value }))}
              className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOverrideEditor(null)} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
              <button
                onClick={() => {
                  const p = Math.max(0, Number(overrideEditor.draft) || 0);
                  setPendingOverride({ line: overrideEditor.line, new_price: p });
                }}
                className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold"
              >
                Approve (manager)
              </button>
            </div>
          </div>
        </div>
      )}
      <ManagerPinModal
        open={!!pendingOverride}
        onClose={() => { setPendingOverride(null); setOverrideEditor(null); }}
        action="price_override"
        bill_id={bill?.bill_id || ''}
        detail={pendingOverride ? `${pendingOverride.line.item_name}: ${formatPKR(pendingOverride.line.unit_price)} → ${formatPKR(pendingOverride.new_price)}` : ''}
        onApproved={async () => {
          if (!pendingOverride) return;
          const next = { ...pendingOverride.line, unit_price: pendingOverride.new_price, price_overridden: true };
          next.line_total = lineTotal(next);
          await saveBillItem(next);
          setPendingOverride(null);
          setOverrideEditor(null);
          await refreshAll();
        }}
      />
    </aside>
  );
}

function LineMenuItem({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-xs hover:bg-paolas-border ${danger ? 'text-red-300' : 'text-gray-200'}`}
    >
      {children}
    </button>
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
