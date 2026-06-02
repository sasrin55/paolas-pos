import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { updateTable, saveBill, saveBillItem, deleteBillItem, appendAudit } from '../data-layer/index.js';

const STATUS_STYLES = {
  free:           'bg-paolas-panel border-paolas-border text-gray-300',
  occupied:       'bg-emerald-900/40 border-emerald-700 text-emerald-100',
  bill_requested: 'bg-amber-900/40 border-amber-600 text-amber-100',
};
const STATUS_LABEL = {
  free: 'Free',
  occupied: 'Occupied',
  bill_requested: 'Bill requested',
};

export default function FloorView({ selectedTableId, onSelectTable, onOpenOrder, onTransferRequest, onMergeRequest, onStartTakeaway, onStartDelivery, onOpenHistory }) {
  const { tables, bills, billItems, currentUser, refreshAll } = useApp();
  const [actionTable, setActionTable] = useState(null);

  const billFor = (t) => t.active_bill_id ? bills.find((b) => b.bill_id === t.active_bill_id) : null;
  const itemCountFor = (b) => b ? billItems.filter((x) => x.bill_id === b.bill_id).length : 0;

  return (
    <section className="flex-1 p-4 md:p-6 overflow-auto">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-semibold">Floor</h2>
        <p className="text-sm text-gray-400">{tables.length} tables · tap to open order</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={onStartTakeaway} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border text-sm font-medium">
          + Takeaway
        </button>
        <button onClick={onStartDelivery} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border text-sm font-medium">
          + Delivery
        </button>
        <button onClick={onOpenHistory} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border text-sm font-medium">
          Today's bills
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
        {tables.map((t) => {
          const bill = billFor(t);
          const selected = selectedTableId === t.table_id;
          return (
            <div key={t.table_id} className="relative">
              <button
                onClick={() => { onSelectTable(t.table_id); onOpenOrder?.(); }}
                onContextMenu={(e) => { e.preventDefault(); setActionTable(t); }}
                className={`w-full min-h-tap rounded-xl border p-4 text-left transition active:scale-[0.98] ${STATUS_STYLES[t.status]} ${selected ? 'ring-2 ring-paolas-accent' : ''}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold">{t.label}</span>
                  <span className="text-[10px] uppercase tracking-wide opacity-70">{t.zone}</span>
                </div>
                <div className="mt-1 text-xs opacity-80">Seats {t.capacity}</div>
                <div className="mt-2 text-[11px] uppercase tracking-wide opacity-70">{STATUS_LABEL[t.status]}</div>
                {bill && (
                  <div className="mt-2 text-xs opacity-90">{itemCountFor(bill)} item(s)</div>
                )}
              </button>
              <button
                onClick={() => setActionTable(t)}
                className="absolute top-1 right-1 w-7 h-7 rounded-md text-xs text-gray-300/70 hover:bg-paolas-border"
                title="Table actions"
              >
                ⋯
              </button>
            </div>
          );
        })}
      </div>

      {actionTable && (
        <TableActions
          table={actionTable}
          onClose={() => setActionTable(null)}
          onTransfer={() => { onTransferRequest?.(actionTable); setActionTable(null); }}
          onMerge={() => { onMergeRequest?.(actionTable); setActionTable(null); }}
          onMarkBillRequested={async () => {
            await updateTable({ ...actionTable, status: 'bill_requested' });
            await refreshAll();
            setActionTable(null);
          }}
          onForceFree={async () => {
            // Manager-gated free-up; emits an audit row.
            await updateTable({ ...actionTable, status: 'free', active_bill_id: null });
            await appendAudit({
              time: new Date().toISOString(),
              user_id: currentUser?.user_id || '',
              action: 'table_force_free',
              bill_id: actionTable.active_bill_id || '',
              detail: actionTable.label,
            });
            await refreshAll();
            setActionTable(null);
          }}
        />
      )}
    </section>
  );
}

function TableActions({ table, onClose, onTransfer, onMerge, onMarkBillRequested, onForceFree }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 bg-paolas-panel border border-paolas-border rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-sm p-4"
      >
        <div className="mb-3">
          <div className="text-lg font-semibold">{table.label} actions</div>
          <div className="text-xs text-gray-400">{table.zone} · {STATUS_LABEL[table.status]}</div>
        </div>
        <div className="grid gap-2">
          <ActionBtn disabled={!table.active_bill_id} onClick={onMarkBillRequested}>Mark bill requested</ActionBtn>
          <ActionBtn disabled={!table.active_bill_id} onClick={onTransfer}>Transfer order to another table</ActionBtn>
          <ActionBtn disabled={!table.active_bill_id} onClick={onMerge}>Merge into another table</ActionBtn>
          <ActionBtn onClick={onForceFree} danger>Force free (manager)</ActionBtn>
          <ActionBtn onClick={onClose} ghost>Cancel</ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ children, disabled, onClick, danger, ghost }) {
  const cls = danger
    ? 'bg-red-900/40 border-red-700 text-red-100'
    : ghost
    ? 'bg-transparent border-paolas-border text-gray-300'
    : 'bg-paolas-border text-white';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-tap px-4 py-3 rounded-xl border ${cls} text-left disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
