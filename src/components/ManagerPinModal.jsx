import { useState } from 'react';
import Modal from './Modal.jsx';
import PinPad from './PinPad.jsx';
import { useApp } from '../state/AppContext.jsx';
import { appendAudit } from '../data-layer/index.js';

export default function ManagerPinModal({ open, onClose, action, bill_id = '', detail = '', onApproved }) {
  const { verifyManagerPin } = useApp();
  const [error, setError] = useState('');

  const onPin = async (pin) => {
    const mgr = await verifyManagerPin(pin);
    if (!mgr) { setError('Wrong PIN'); return; }
    await appendAudit({
      time: new Date().toISOString(),
      user_id: mgr.user_id,
      action,
      bill_id,
      detail,
    });
    setError('');
    onApproved?.(mgr);
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Manager approval — ${action.replace(/_/g, ' ')}`}>
      <div className="p-5">
        {detail && <p className="text-sm text-gray-300 mb-4">{detail}</p>}
        <PinPad onSubmit={onPin} error={error} />
        <p className="mt-4 text-xs text-gray-500 text-center">
          This action will be written to the audit log.
        </p>
      </div>
    </Modal>
  );
}
