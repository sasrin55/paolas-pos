// Public data-layer API. UI code imports from here ONLY.
// Today this wraps IndexedDB + sync queue + Sheets adapter. Swap out
// the implementation (e.g. for Supabase) without touching the UI.

import * as ls from './local-store.js';
import { enqueue, onQueueChange, startDrainer } from './sync-queue.js';

export { onQueueChange, startDrainer };

// ----- reads -----
export const listMenu           = ()    => ls.getAll('menu');
export const listModifierGroups = ()    => ls.getAll('modifierGroups');
export const listModifiers      = ()    => ls.getAll('modifiers');
export const listTables         = ()    => ls.getAll('tables');
export const listUsers          = ()    => ls.getAll('users');
export const listBills          = ()    => ls.getAll('bills');
export const listBillItems      = ()    => ls.getAll('billItems');
export const listPayments       = ()    => ls.getAll('payments');
export const listAuditLog       = ()    => ls.getAll('auditLog');
export const listOutbox         = ()    => ls.getAll('outbox');
export const getBill            = (id)  => ls.get('bills', id);
export const getMeta            = (key) => ls.get('meta', key);

// ----- writes (each one: local immediately, then queue for Sheets) -----

export async function saveMenuItem(item) {
  await ls.put('menu', item);
  await enqueue('upsertMenu', item);
}

export async function toggleItemAvailability(item_id, available, by_user) {
  const item = await ls.get('menu', item_id);
  if (!item) return;
  item.available = available;
  await ls.put('menu', item);
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
  await enqueue('upsertTable', table);
}

export async function saveBill(bill) {
  await ls.put('bills', bill);
  await enqueue('upsertBill', bill);
}

export async function saveBillItem(item) {
  await ls.put('billItems', item);
  await enqueue('upsertBillItem', item);
}

export async function deleteBillItem(line_id) {
  await ls.del('billItems', line_id);
  await enqueue('deleteBillItem', { line_id });
}

export async function savePayment(p) {
  await ls.put('payments', p);
  await enqueue('upsertPayment', p);
}

export async function appendAudit(entry) {
  await ls.put('auditLog', entry);
  await enqueue('appendAudit', entry);
}

export async function setMeta(key, value) {
  await ls.put('meta', { key, value });
}

// ----- seed bootstrap -----
export async function seedIfEmpty(seed) {
  const seeded = await ls.get('meta', 'seeded');
  if (seeded?.value) return;
  await ls.putMany('menu',           seed.menu);
  await ls.putMany('modifierGroups', seed.modifierGroups);
  await ls.putMany('modifiers',      seed.modifiers);
  await ls.putMany('tables',         seed.tables);
  await ls.putMany('users',          seed.users);
  await ls.put('meta', { key: 'seeded', value: new Date().toISOString() });
}
