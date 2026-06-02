import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { findCustomerByPhone } from '../data-layer/index.js';

// Mode-specific bill metadata captured before the bill is created. Avoids
// the silent "Takeaway" bills with no phone that staff couldn't follow up on.
export default function NonTableStartSheet({ open, mode, onClose, onConfirm }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState(null);

  useEffect(() => {
    if (!open) return;
    setPhone(''); setName(''); setAddress(''); setScheduledFor(''); setMatchedCustomer(null);
  }, [open]);

  useEffect(() => {
    let alive = true;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) { setMatchedCustomer(null); return; }
    findCustomerByPhone(phone).then((c) => { if (alive) setMatchedCustomer(c || null); });
    return () => { alive = false; };
  }, [phone]);

  const isTakeaway = mode === 'takeaway';
  const isDelivery = mode === 'delivery';

  const canConfirm = isTakeaway
    ? !!phone.trim()
    : isDelivery
      ? !!phone.trim() && !!address.trim()
      : true;

  const confirm = () => {
    onConfirm({
      phone: phone.trim(),
      name: (matchedCustomer?.name || name).trim(),
      customer: matchedCustomer,
      address: address.trim(),
      scheduled_for: scheduledFor || '',
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTakeaway ? 'New takeaway order' : isDelivery ? 'New delivery order' : 'New order'}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
          >
            Start order
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-gray-400">
            Phone {(isTakeaway || isDelivery) && <span className="text-red-400">*</span>}
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0300 1234567"
            inputMode="tel"
            className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
          />
        </label>

        {matchedCustomer ? (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 p-3 text-xs">
            ✓ Existing customer · <span className="font-semibold">{matchedCustomer.name || matchedCustomer.phone}</span>
            {matchedCustomer.visit_count ? ` · ${matchedCustomer.visit_count} prior visit${matchedCustomer.visit_count === 1 ? '' : 's'}` : ''}
          </div>
        ) : (
          phone.replace(/\D/g, '').length >= 4 && (
            <label className="block">
              <span className="text-xs text-gray-400">Name (new customer)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
            </label>
          )
        )}

        {isDelivery && (
          <>
            <label className="block">
              <span className="text-xs text-gray-400">Address <span className="text-red-400">*</span></span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House #, street, area, landmark"
                rows={3}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Scheduled for (optional)</span>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
              <span className="text-[11px] text-gray-500">Leave blank for ASAP.</span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
