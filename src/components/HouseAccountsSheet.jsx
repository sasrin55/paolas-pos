import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import ManagerPinModal from './ManagerPinModal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { TENDER_LABEL } from '../lib/config.js';
import { newPaymentId } from '../lib/id.js';
import { settleHouseAccount } from '../data-layer/index.js';

// Settlement tenders — house-account itself is not a valid settle method,
// and refund doesn't make sense here.
const SETTLE_TENDERS = ['cash', 'card', 'easypaisa', 'jazzcash', 'raast', 'online-transfer'];

export default function HouseAccountsSheet({ open, onClose }) {
  const { customers, payments, refreshAll } = useApp();
  const [settling, setSettling] = useState(null);          // { customer, draft, tender }
  const [pending, setPending] = useState(null);            // ready to PIN-approve

  // Only customers with a non-zero balance show up — keeps the list focused.
  // Sort descending by balance so the biggest tabs are at the top.
  const list = useMemo(() =>
    customers
      .filter((c) => (c.house_account_balance || 0) > 0)
      .sort((a, b) => (b.house_account_balance || 0) - (a.house_account_balance || 0)),
    [customers]
  );

  const totalOutstanding = list.reduce((s, c) => s + (c.house_account_balance || 0), 0);

  const settlementsFor = (cid) => payments.filter((p) => p.is_settlement && p.customer_id === cid)
    .sort((a, b) => (b.time || '').localeCompare(a.time || ''));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="House accounts"
        wide
        footer={
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-300">
              {list.length} open · <span className="font-semibold text-white">{formatPKR(totalOutstanding)}</span> outstanding
            </span>
          </div>
        }
      >
        <div className="p-5">
          {list.length === 0 && (
            <p className="text-sm text-gray-400 italic">No outstanding balances.</p>
          )}
          <ul className="divide-y divide-paolas-border">
            {list.map((c) => (
              <li key={c.customer_id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name || c.phone}</div>
                    <div className="text-xs text-gray-400 truncate">{c.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{formatPKR(c.house_account_balance || 0)}</div>
                    <button
                      onClick={() => setSettling({ customer: c, draft: String(c.house_account_balance), tender: 'cash' })}
                      className="text-xs px-3 py-1 rounded bg-paolas-accent mt-1"
                    >
                      Settle
                    </button>
                  </div>
                </div>
                {settlementsFor(c.customer_id).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 cursor-pointer">
                      {settlementsFor(c.customer_id).length} previous settlement{settlementsFor(c.customer_id).length === 1 ? '' : 's'}
                    </summary>
                    <ul className="mt-1 text-xs space-y-0.5">
                      {settlementsFor(c.customer_id).slice(0, 6).map((p) => (
                        <li key={p.payment_id} className="flex justify-between text-gray-400">
                          <span>{new Date(p.time).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })} · {TENDER_LABEL[p.tender_type]}</span>
                          <span>-{formatPKR(p.amount_pkr)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {settling && (
        <Modal
          open
          onClose={() => setSettling(null)}
          title={`Settle — ${settling.customer.name || settling.customer.phone}`}
        >
          <div className="p-5 space-y-3 text-sm">
            <div className="rounded-lg bg-paolas-bg border border-paolas-border p-3 text-xs">
              Outstanding: <span className="font-semibold text-white">{formatPKR(settling.customer.house_account_balance)}</span>
            </div>
            <label className="block">
              <span className="text-xs text-gray-400">Amount to settle (PKR)</span>
              <input
                type="number"
                value={settling.draft}
                onChange={(e) => setSettling((s) => ({ ...s, draft: e.target.value }))}
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => setSettling((s) => ({ ...s, draft: String(s.customer.house_account_balance) }))} className="text-xs px-2 py-1 rounded bg-paolas-border">Full balance</button>
                <button onClick={() => setSettling((s) => ({ ...s, draft: String(Math.round(s.customer.house_account_balance / 2)) }))} className="text-xs px-2 py-1 rounded bg-paolas-border">Half</button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Tender</span>
              <select
                value={settling.tender}
                onChange={(e) => setSettling((s) => ({ ...s, tender: e.target.value }))}
                className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
              >
                {SETTLE_TENDERS.map((t) => <option key={t} value={t}>{TENDER_LABEL[t]}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSettling(null)} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
              <button
                onClick={() => setPending({ ...settling, amount: Number(settling.draft) || 0 })}
                disabled={!(Number(settling.draft) > 0)}
                className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
              >
                Approve (manager)
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ManagerPinModal
        open={!!pending}
        onClose={() => setPending(null)}
        action="house_account_settle"
        bill_id=""
        detail={pending ? `${pending.customer.name || pending.customer.phone}: ${formatPKR(pending.amount)} via ${TENDER_LABEL[pending.tender]}` : ''}
        requireReason
        onApproved={async (mgr, reason) => {
          if (!pending) return;
          await settleHouseAccount({
            customer_id: pending.customer.customer_id,
            outlet_id: pending.customer.outlet_id,
            tender_type: pending.tender,
            amount_pkr: pending.amount,
            payment_id: newPaymentId(),
            user_id: mgr.user_id,
            reason,
          });
          setPending(null);
          setSettling(null);
          await refreshAll();
        }}
      />
    </>
  );
}
