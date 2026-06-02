// Public data-layer API. UI code imports from here ONLY.
// Today this wraps IndexedDB + sync queue + Sheets adapter + realtime peer
// sync. Swap out the implementation (e.g. for Supabase) without touching UI.

import * as ls from './local-store.js';
import { enqueue, onQueueChange, startDrainer } from './sync-queue.js';
import { broadcast, startRealtime, onRealtimeMessage, onRealtimeState } from './sync-client.js';

export { onQueueChange, startDrainer, startRealtime, onRealtimeMessage, onRealtimeState };

// ----- reads -----
export const listMenu           = ()    => ls.getAll('menu');
export const listModifierGroups = ()    => ls.getAll('modifierGroups');
export const listModifiers      = ()    => ls.getAll('modifiers');
export const listTables         = ()    => ls.getAll('tables');
export const listUsers          = ()    => ls.getAll('users');
export const listCustomers      = ()    => ls.getAll('customers');
export const listShifts         = ()    => ls.getAll('shifts');
export const listBills          = ()    => ls.getAll('bills');
export const listBillItems      = ()    => ls.getAll('billItems');
export const listPayments       = ()    => ls.getAll('payments');
export const listAuditLog       = ()    => ls.getAll('auditLog');
export const listOutbox         = ()    => ls.getAll('outbox');
export const getBill            = (id)  => ls.get('bills', id);
export const getCustomer        = (id)  => ls.get('customers', id);
export const getMeta            = (key) => ls.get('meta', key);

// applyRemote — invoked when a peer broadcasts a write; updates local store
// silently (NOT re-broadcast, NOT enqueued — it already happened upstream).
export async function applyRemote(store, value, op = 'put') {
  if (op === 'delete') return ls.del(store, value);
  return ls.put(store, value);
}

// ----- writes (each one: local immediately, then queue for Sheets) -----

export async function saveMenuItem(item) {
  await ls.put('menu', item);
  broadcast('menu', item, 'put');
  await enqueue('upsertMenu', item);
}

export async function saveCustomer(c) {
  await ls.put('customers', c);
  broadcast('customers', c, 'put');
  await enqueue('upsertCustomer', c);
}

export async function findCustomerByPhone(phone) {
  const all = await ls.getAll('customers');
  return all.find((c) => normalisePhone(c.phone) === normalisePhone(phone)) || null;
}

function normalisePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

export async function saveShift(s) {
  await ls.put('shifts', s);
  broadcast('shifts', s, 'put');
  await enqueue('upsertShift', s);
}

export async function toggleItemAvailability(item_id, available, by_user) {
  const item = await ls.get('menu', item_id);
  if (!item) return;
  item.available = available;
  await ls.put('menu', item);
  broadcast('menu', item, 'put');
  await enqueue('upsertMenu', item);
  await appendAudit({
    time: new Date().toISOString(),
    user_id: by_user,
    action: available ? 'item_unsuspended' : 'item_86d',
    bill_id: '',
    detail: `${item.name}`,
  });
}

export async function updateTable(table) {
  await ls.put('tables', table);
  broadcast('tables', table, 'put');
  await enqueue('upsertTable', table);
}

export async function saveBill(bill) {
  await ls.put('bills', bill);
  broadcast('bills', bill, 'put');
  await enqueue('upsertBill', bill);
}

export async function saveBillItem(item) {
  await ls.put('billItems', item);
  broadcast('billItems', item, 'put');
  await enqueue('upsertBillItem', item);
}

export async function deleteBillItem(line_id) {
  await ls.del('billItems', line_id);
  broadcast('billItems', line_id, 'delete');
  await enqueue('deleteBillItem', { line_id });
}

export async function savePayment(p) {
  await ls.put('payments', p);
  broadcast('payments', p, 'put');
  await enqueue('upsertPayment', p);
}

export async function appendAudit(entry) {
  await ls.put('auditLog', entry);
  // audit log is local-write-once; not broadcast (peer's own writes already
  // generated their own audit). Still flow to Sheets for the central record.
  await enqueue('appendAudit', entry);
}

export async function setMeta(key, value) {
  await ls.put('meta', { key, value });
}

// ----- seed bootstrap -----
export async function seedIfEmpty(seed) {
  const seeded = await ls.get('meta', 'seeded');
  if (seeded?.value) {
    // schema migration: backfill image_url + outlet_id on legacy rows
    const outletId = seed.menu[0]?.outlet_id || 'PAOLAS';
    const menu = await ls.getAll('menu');
    const menuFixes = menu.filter((m) => m.image_url === undefined || m.outlet_id === undefined)
      .map((m) => ({
        ...m,
        outlet_id: m.outlet_id || outletId,
        image_url: m.image_url ?? seed.menu.find((s) => s.item_id === m.item_id)?.image_url ?? '',
      }));
    if (menuFixes.length) await ls.putMany('menu', menuFixes);
    for (const store of ['tables', 'users']) {
      const rows = await ls.getAll(store);
      const fixes = rows.filter((r) => r.outlet_id === undefined).map((r) => ({ ...r, outlet_id: outletId }));
      if (fixes.length) await ls.putMany(store, fixes);
    }
    return;
  }
  await ls.putMany('menu',           seed.menu);
  await ls.putMany('modifierGroups', seed.modifierGroups);
  await ls.putMany('modifiers',      seed.modifiers);
  await ls.putMany('tables',         seed.tables);
  await ls.putMany('users',          seed.users);
  await ls.put('meta', { key: 'seeded', value: new Date().toISOString() });
}
