import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PinPad from './PinPad.jsx';
import { useApp } from '../state/AppContext.jsx';
import { appendAudit } from '../data-layer/index.js';

const REASON_SUGGESTIONS = {
  void_item:       ['guest changed mind', 'wrong item entered', 'kitchen unable to make'],
  void_bill:       ['walked out', 'duplicate', 'comp'],
  reduce_item:     ['guest portion smaller', 'split with another guest'],
  replace_item:    ['guest swap', 'wrong item fired'],
  refund:          ['quality issue', 'overcharge', 'duplicate bill'],
  reprint_receipt: ['guest asked', 'printer jam', 'kitchen copy'],
  recall_bill:     ['missed item', 'wrong tender', 'guest returned'],
  apply_discount:  ['regular', 'staff family', 'manager comp'],
  comp:            ['service recovery', 'staff meal'],
  price_override:  ['agreed price', 'promo'],
  item_86d:        ['sold out'],
  item_unsuspended:['restocked'],
  table_force_free:['ghost bill', 'walkout cleanup'],
};

export default function ManagerPinModal({
  open, onClose, action, bill_id = '', detail = '',
  requireReason = false, onApproved,
}) {
  const { verifyManagerPin, users, config } = useApp();
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { if (open) { setReason(''); setError(''); } }, [open]);

  // Dev bypass: auto-approve as first manager when auth_disabled is on.
  useEffect(() => {
    if (!open || !config?.auth_disabled) return;
    const mgr = users.find((u) => u.role === 'manager') || users[0];
    if (!mgr) return;
    (async () => {
      await appendAudit({
        time: new Date().toISOString(),
        user_id: mgr.user_id,
        action,
        bill_id,
        reason: '(pins disabled)',
        detail,
      });
      onApproved?.(mgr, '(pins disabled)');
      onClose?.();
    })();
  }, [open, config?.auth_disabled, users, action, bill_id, detail, onApproved, onClose]);

  const suggestions = REASON_SUGGESTIONS[action] || [];

  const onPin = async (pin) => {
    if (requireReason && !reason.trim()) {
      setError('Reason required');
      return;
    }
    const mgr = await verifyManagerPin(pin);
    if (!mgr) { setError('Wrong PIN'); return; }
    await appendAudit({
      time: new Date().toISOString(),
      user_id: mgr.user_id,
      action,
      bill_id,
      reason: reason.trim(),
      detail,
    });
    setError('');
    onApproved?.(mgr, reason.trim());
    onClose?.();
  };

  // Hide the modal entirely when auth is disabled (dev mode).
  if (config?.auth_disabled) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Manager approval — ${action.replace(/_/g, ' ')}`}>
      <div className="p-5">
        {detail && <p className="text-sm text-gray-300 mb-4">{detail}</p>}

        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Reason {requireReason && <span className="text-red-400">*</span>}
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={requireReason ? 'short, honest reason' : 'optional'}
            className="w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border text-sm"
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setReason(s)}
                  className="text-[11px] px-2 py-1 rounded bg-paolas-border text-gray-200"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <PinPad onSubmit={onPin} error={error} />
        <p className="mt-4 text-xs text-gray-500 text-center">
          This action will be written to the audit log with the reason above.
        </p>
      </div>
    </Modal>
  );
}
