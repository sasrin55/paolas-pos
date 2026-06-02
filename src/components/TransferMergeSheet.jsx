import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { saveBill, saveBillItem, deleteBillItem, updateTable, appendAudit } from '../data-layer/index.js';
import { nowISO } from '../lib/id.js';

export default function TransferMergeSheet({ open, onClose, mode, sourceTable }) {
  const { tables, bills, billItems, currentUser, refreshAll } = useApp();
  if (!sourceTable) return null;

  const eligible = tables.filter((t) => t.table_id !== sourceTable.table_id && (mode === 'transfer' ? t.status === 'free' : !!t.active_bill_id));

  const sourceBill = bills.find((b) => b.bill_id === sourceTable.active_bill_id);

  const doIt = async (target) => {
    if (!sourceBill) return;
    if (mode === 'transfer') {
      // move bill to a new (free) table
      await saveBill({ ...sourceBill, table: target.table_id, table_label: target.label });
      await updateTable({ ...sourceTable, status: 'free', active_bill_id: null });
      await updateTable({ ...target, status: 'occupied', active_bill_id: sourceBill.bill_id });
      await appendAudit({
        time: nowISO(), user_id: currentUser?.user_id || '',
        action: 'table_transfer',
        bill_id: sourceBill.bill_id,
        detail: `${sourceTable.label} → ${target.label}`,
      });
    } else {
      // merge: move all source items into target's open bill, close/remove source bill
      const targetBill = bills.find((b) => b.bill_id === target.active_bill_id);
      if (!targetBill) return;
      const moves = billItems.filter((it) => it.bill_id === sourceBill.bill_id);
      for (const it of moves) {
        await saveBillItem({ ...it, bill_id: targetBill.bill_id });
        await deleteBillItem(it.line_id);
      }
      await saveBill({ ...sourceBill, status: 'merged', time_closed: nowISO(), merged_into: targetBill.bill_id });
      await updateTable({ ...sourceTable, status: 'free', active_bill_id: null });
      await appendAudit({
        time: nowISO(), user_id: currentUser?.user_id || '',
        action: 'table_merge',
        bill_id: sourceBill.bill_id,
        detail: `${sourceTable.label} merged into ${target.label}`,
      });
    }
    await refreshAll();
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'transfer' ? `Transfer ${sourceTable.label}` : `Merge ${sourceTable.label} into…`}
    >
      <div className="p-5">
        {!sourceBill && <p className="text-sm text-gray-400">Source has no open bill.</p>}
        {sourceBill && (
          <>
            <p className="text-sm text-gray-400 mb-4">
              {mode === 'transfer'
                ? 'Pick a free table to move this order to.'
                : 'Pick an occupied table to merge this order into.'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {eligible.map((t) => (
                <button
                  key={t.table_id}
                  onClick={() => doIt(t)}
                  className="min-h-tap rounded-xl border border-paolas-border bg-paolas-border/40 px-3 py-3 text-left"
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[11px] text-gray-400">{t.zone}</div>
                </button>
              ))}
              {eligible.length === 0 && <div className="col-span-full text-sm text-gray-500 italic">No eligible tables.</div>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
