import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { TENDER_TYPES, TENDER_LABEL } from '../lib/config.js';
import { appendAudit } from '../data-layer/index.js';
import { nowISO, todayISO } from '../lib/id.js';

export default function EODReport({ open, onClose }) {
  const { bills, billItems, payments, auditLog, config, currentUser } = useApp();
  const today = todayISO();
  const todays = useMemo(() => bills.filter((b) => b.date === today && b.status === 'closed'), [bills, today]);
  const todayBillIds = new Set(todays.map((b) => b.bill_id));
  const todayPayments = payments.filter((p) => todayBillIds.has(p.bill_id));

  const grossSales = todays.reduce((s, b) => s + (b.subtotal || 0), 0);
  const discounts  = todays.reduce((s, b) => s + (b.discount || 0), 0);
  const comps      = todays.reduce((s, b) => s + (b.comp || 0), 0);
  const service    = todays.reduce((s, b) => s + (b.service_charge || 0), 0);
  const tax        = todays.reduce((s, b) => s + (b.tax || 0), 0);
  const netSales   = todays.reduce((s, b) => s + (b.total || 0), 0);

  const byTender = TENDER_TYPES.map((t) => ({
    t,
    amount: todayPayments.filter((p) => p.tender_type === t).reduce((s, p) => s + p.amount_pkr, 0),
  }));
  const totalCollected = byTender.reduce((s, x) => s + x.amount, 0);

  const voidCount = auditLog.filter((a) => a.action === 'void_item' && a.time?.slice(0, 10) === today).length;

  const [countedCash, setCountedCash] = useState('');
  const expectedCash = byTender.find((x) => x.t === 'cash')?.amount || 0;
  const variance = (Number(countedCash) || 0) - expectedCash;

  // Reconciliation sanity check (numbers the owner must trust)
  const reconciles = totalCollected === netSales;

  const onPrint = () => window.print();

  const onCloseDay = async () => {
    await appendAudit({
      time: nowISO(),
      user_id: currentUser?.user_id || '',
      action: 'eod_close',
      bill_id: '',
      detail: `bills=${todays.length} gross=${grossSales} net=${netSales} counted_cash=${countedCash} variance=${variance}`,
    });
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`End of day — ${today}`}
      wide
      printable
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onPrint} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Print</button>
          <button onClick={onCloseDay} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
            Close day (log)
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4 text-sm" id="eod-print">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Bills closed" value={todays.length} />
          <Stat label="Voids (count)" value={voidCount} />
          <Stat label="Gross sales" value={formatPKR(grossSales)} />
          <Stat label="Discounts" value={formatPKR(discounts)} />
          <Stat label="Comps" value={formatPKR(comps)} />
          <Stat label="Service charge" value={formatPKR(service)} />
          <Stat label="Tax" value={formatPKR(tax)} />
          <Stat label="Net sales (charged)" value={formatPKR(netSales)} bold />
        </div>

        <div>
          <h4 className="font-medium mb-2">By tender</h4>
          <table className="w-full">
            <tbody>
              {byTender.filter((x) => x.amount > 0).map((x) => (
                <tr key={x.t}>
                  <td className="py-1">{TENDER_LABEL[x.t]}</td>
                  <td className="py-1 text-right">{formatPKR(x.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-paolas-border font-semibold">
                <td className="py-1">Total collected</td>
                <td className="py-1 text-right">{formatPKR(totalCollected)}</td>
              </tr>
            </tbody>
          </table>
          {!reconciles && (
            <p className="mt-2 text-xs text-red-400">
              Reconciliation mismatch: collected ≠ net sales. Investigate before closing the day.
            </p>
          )}
        </div>

        <div>
          <h4 className="font-medium mb-2">Cash reconciliation</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-paolas-bg border border-paolas-border p-3">
              <div className="text-xs text-gray-400">Expected (from Payments)</div>
              <div className="text-lg font-semibold">{formatPKR(expectedCash)}</div>
            </div>
            <div className="rounded-lg bg-paolas-bg border border-paolas-border p-3 print:hidden">
              <div className="text-xs text-gray-400">Counted in drawer</div>
              <input
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                type="number"
                placeholder="0"
                className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
              />
            </div>
          </div>
          {countedCash !== '' && (
            <p className={`mt-2 text-sm ${variance === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
              Variance: {variance >= 0 ? '+' : ''}{formatPKR(variance)}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, bold }) {
  return (
    <div className={`rounded-lg bg-paolas-bg border border-paolas-border p-3 ${bold ? 'col-span-2' : ''}`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 ${bold ? 'text-2xl font-bold' : 'text-base font-semibold'}`}>{value}</div>
    </div>
  );
}
