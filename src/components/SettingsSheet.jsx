import { useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { drain } from '../data-layer/sync-queue.js';

export default function SettingsSheet({ open, onClose }) {
  const { config, saveConfig, currentUser } = useApp();
  const [local, setLocal] = useState(config);

  const update = (path, value) => {
    setLocal((cur) => {
      const next = structuredClone(cur);
      const parts = path.split('.');
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]];
      cursor[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    await saveConfig(local);
    onClose?.();
  };

  const num = (v) => v === '' || v === null || v === undefined ? null : Number(v);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
          <button onClick={save} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">Save</button>
        </div>
      }
    >
      <div className="p-5 space-y-6 text-sm">
        <Section title="Restaurant">
          <Field label="Name"        value={local.restaurant.name}        onChange={(v) => update('restaurant.name', v)} />
          <Field label="Address"     value={local.restaurant.address}     onChange={(v) => update('restaurant.address', v)} />
          <Field label="Phone"       value={local.restaurant.phone}       onChange={(v) => update('restaurant.phone', v)} />
          <Field label="GST number"  value={local.restaurant.gst_number}  onChange={(v) => update('restaurant.gst_number', v)} />
        </Section>

        <Section title="Tax (tender-aware — PRA differs cash vs digital)">
          <Toggle label="Enable tax" value={local.tax.enabled} onChange={(v) => update('tax.enabled', v)} />
          <Field type="number" label="Cash rate %"   value={local.tax.cash_rate_pct   ?? ''} onChange={(v) => update('tax.cash_rate_pct',   num(v))} />
          <Field type="number" label="Card rate %"   value={local.tax.card_rate_pct   ?? ''} onChange={(v) => update('tax.card_rate_pct',   num(v))} />
          <Field type="number" label="Wallet rate %" value={local.tax.wallet_rate_pct ?? ''} onChange={(v) => update('tax.wallet_rate_pct', num(v))} />
        </Section>

        <Section title="Service charge">
          <Toggle label="Enable" value={local.service_charge.enabled} onChange={(v) => update('service_charge.enabled', v)} />
          <Field type="number" label="Rate %" value={local.service_charge.rate_pct ?? ''} onChange={(v) => update('service_charge.rate_pct', num(v))} />
        </Section>

        <Section title="Language">
          <label className="block">
            <span className="text-xs text-gray-400">UI language</span>
            <select
              value={local.locale || 'en'}
              onChange={(e) => update('locale', e.target.value)}
              className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
            >
              <option value="en">English</option>
              <option value="ur" disabled>اردو (strings file pending)</option>
            </select>
          </label>
          <p className="text-xs text-gray-500">
            i18n scaffold is in place. Drop <code>src/lib/strings/ur.json</code> in and the Urdu option enables itself.
          </p>
        </Section>

        <Section title="Real-time multi-device sync (Phase 12)">
          <Field
            label="LAN sync server URL"
            value={local.sync_url || ''}
            onChange={(v) => update('sync_url', v)}
          />
          <p className="text-xs text-gray-500">
            Run <code>npm run sync</code> on the cashier till, then paste <code>ws://{'<till-ip>'}:3001</code> here on every handheld.
            When connected, table/order/menu updates flow live between devices.
          </p>
        </Section>

        <Section title="Loyalty">
          <Toggle label="Enable loyalty points" value={local.loyalty?.enabled} onChange={(v) => update('loyalty.enabled', v)} />
          <Field
            type="number"
            label="Points per PKR (e.g. 0.01 = 1 point per Rs 100)"
            value={local.loyalty?.points_per_pkr ?? ''}
            onChange={(v) => update('loyalty.points_per_pkr', num(v))}
          />
        </Section>

        <Section title="Sheets sync (Apps Script web app)">
          <Field label="Endpoint URL"  value={local.sheets.endpoint}      onChange={(v) => update('sheets.endpoint', v)} />
          <Field label="Shared secret" value={local.sheets.shared_secret} onChange={(v) => update('sheets.shared_secret', v)} />
          <div>
            <button onClick={() => drain(local)} className="min-h-tap px-3 py-2 rounded-lg bg-paolas-border">Drain outbox now</button>
          </div>
        </Section>

        <Section title="FBR / PRA e-invoicing">
          <Toggle label="Enabled"         value={local.fbr.enabled}          onChange={(v) => update('fbr.enabled', v)} />
          <Toggle label="Integration live" value={local.fbr.integration_live} onChange={(v) => update('fbr.integration_live', v)} />
          <Field label="Endpoint" value={local.fbr.endpoint} onChange={(v) => update('fbr.endpoint', v)} />
          <Field label="POS ID"   value={local.fbr.pos_id}   onChange={(v) => update('fbr.pos_id', v)} />
          <Field label="Fallback invoice prefix" value={local.fbr.fallback_invoice_prefix} onChange={(v) => update('fbr.fallback_invoice_prefix', v)} />
          <p className="text-xs text-gray-500">
            While integration is off, the receipt prints a slot invoice number based on the bill ID so paper trails are continuous. Flip the toggle once the live FBR/PRA push is wired up.
          </p>
        </Section>

        {currentUser?.role !== 'manager' && (
          <p className="text-xs text-amber-300">Note: in v1 anyone can edit settings. Wire a manager gate here before launch.</p>
        )}
      </div>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="font-medium mb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
      />
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-3">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5" />
      <span>{label}</span>
    </label>
  );
}
