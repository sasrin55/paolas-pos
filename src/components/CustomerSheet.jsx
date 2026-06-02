import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { saveBill, saveCustomer, findCustomerByPhone } from '../data-layer/index.js';
import { nowISO } from '../lib/id.js';

export default function CustomerSheet({ open, onClose, bill }) {
  const { customers, bills, refreshAll } = useApp();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(''); setName(''); setMatch(null);
  }, [open]);

  // live search as the user types phone digits
  useEffect(() => {
    let alive = true;
    if (phone.replace(/\D/g, '').length < 4) { setMatch(null); return; }
    findCustomerByPhone(phone).then((c) => { if (alive) setMatch(c); });
    return () => { alive = false; };
  }, [phone]);

  const visitsFor = (cid) =>
    bills.filter((b) => b.customer_id === cid && b.status === 'settled')
         .sort((a, b) => (b.date + b.time_closed).localeCompare(a.date + a.time_closed));

  const attach = async (customer) => {
    if (!bill || !customer) return;
    setBusy(true);
    await saveBill({ ...bill, customer_id: customer.customer_id, customer_phone: customer.phone, customer_name: customer.name });
    setBusy(false);
    await refreshAll();
    onClose?.();
  };

  const createAndAttach = async () => {
    if (!bill || !phone) return;
    setBusy(true);
    const cid = 'CUS-' + phone.replace(/\D/g, '').slice(-9);
    const c = {
      customer_id: cid,
      phone,
      name: name || '',
      first_visit: nowISO(),
      last_visit: nowISO(),
      visit_count: 0,
      total_spend_pkr: 0,
      tags: '',
      notes: '',
      loyalty_points: 0,
    };
    await saveCustomer(c);
    await attach(c);
    setBusy(false);
  };

  if (!bill) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach customer"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
          {match ? (
            <button onClick={() => attach(match)} disabled={busy} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
              Attach {match.name || match.phone}
            </button>
          ) : (
            <button onClick={createAndAttach} disabled={busy || !phone} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
              Create + attach
            </button>
          )}
        </div>
      }
    >
      <div className="p-5 space-y-4 text-sm">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0300 1234567"
            inputMode="tel"
            className="w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
          />
        </div>

        {match ? (
          <div className="rounded-xl border border-emerald-700 bg-emerald-900/30 p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-semibold">{match.name || 'Unnamed'}</div>
                <div className="text-xs text-gray-300">{match.phone}</div>
              </div>
              <div className="text-right text-xs">
                <div className="text-gray-300">{match.visit_count} visits · loyalty {match.loyalty_points || 0}</div>
                <div className="text-gray-400">spend {formatPKR(match.total_spend_pkr || 0)}</div>
              </div>
            </div>
            <div className="mt-3">
              <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-1">Recent visits</h4>
              <ul className="divide-y divide-emerald-900/40 max-h-44 overflow-auto">
                {visitsFor(match.customer_id).slice(0, 6).map((b) => (
                  <li key={b.bill_id} className="py-1.5 flex justify-between">
                    <span>{b.date} · {b.table_label}</span>
                    <span>{formatPKR(b.total || 0)}</span>
                  </li>
                ))}
                {visitsFor(match.customer_id).length === 0 && (
                  <li className="py-1.5 text-gray-400 italic">No previous visits</li>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name (optional, for new customer)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                className="w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
            </div>
            <p className="text-xs text-gray-500">
              No match yet. Type at least 4 digits to search; otherwise click <em>Create + attach</em> to register a new customer.
            </p>
          </>
        )}

        {bill.customer_id && (
          <div className="text-xs text-gray-400">
            Currently attached: {bill.customer_name || ''} · {bill.customer_phone || ''}
          </div>
        )}
      </div>
    </Modal>
  );
}
