// Minimal zero-dep IndexedDB wrapper. One DB, several object stores that
// mirror the Google Sheet tabs 1:1 so the sync adapter can map row-for-row.

const DB_NAME = 'paolas_pos';
const DB_VERSION = 1;

export const STORES = {
  menu:           { keyPath: 'item_id' },
  modifierGroups: { keyPath: 'group_id' },
  modifiers:      { keyPath: 'modifier_id' },
  tables:         { keyPath: 'table_id' },
  users:          { keyPath: 'user_id' },
  bills:          { keyPath: 'bill_id' },
  billItems:      { keyPath: 'line_id' },
  payments:       { keyPath: 'payment_id' },
  auditLog:       { keyPath: 'log_id', autoIncrement: true },
  outbox:         { keyPath: 'queue_id', autoIncrement: true },
  meta:           { keyPath: 'key' },
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, opts);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  return asPromise((await tx(store)).getAll());
}

export async function get(store, key) {
  return asPromise((await tx(store)).get(key));
}

export async function put(store, value) {
  return asPromise((await tx(store, 'readwrite')).put(value));
}

export async function putMany(store, values) {
  const t = await tx(store, 'readwrite');
  await Promise.all(values.map((v) => asPromise(t.put(v))));
}

export async function del(store, key) {
  return asPromise((await tx(store, 'readwrite')).delete(key));
}

export async function clear(store) {
  return asPromise((await tx(store, 'readwrite')).clear());
}

export async function count(store) {
  return asPromise((await tx(store)).count());
}
