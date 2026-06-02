// Outbox drainer. Every mutation that needs to reach Sheets writes a row to
// the `outbox` store; this module periodically tries to push those rows.
// Drainer is event-driven (online + interval) with exponential backoff per row.

import { getAll, del, put } from './local-store.js';
import { pushRow } from './sheets-adapter.js';

const TICK_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

let timer = null;
let draining = false;
let listeners = new Set();

export function onQueueChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  getAll('outbox').then((rows) => {
    listeners.forEach((cb) => cb({ queued: rows.length, online: navigator.onLine }));
  });
}

export async function enqueue(action, payload) {
  await put('outbox', {
    action,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    next_attempt_at: 0,
  });
  emit();
  // Try right away
  drain();
}

export async function drain(config) {
  if (draining || !navigator.onLine) { emit(); return; }
  draining = true;
  try {
    const rows = await getAll('outbox');
    const now = Date.now();
    for (const row of rows) {
      if (row.next_attempt_at > now) continue;
      try {
        await pushRow(config?.sheets?.endpoint || '', config?.sheets?.shared_secret || '', row);
        await del('outbox', row.queue_id);
      } catch (e) {
        row.attempts += 1;
        const backoff = Math.min(MAX_BACKOFF_MS, 2 ** row.attempts * 1000);
        row.next_attempt_at = Date.now() + backoff;
        row.last_error = String(e?.message || e);
        await put('outbox', row);
      }
    }
  } finally {
    draining = false;
    emit();
  }
}

export function startDrainer(getConfig) {
  if (timer) return;
  const tick = () => drain(getConfig?.());
  timer = setInterval(tick, TICK_MS);
  window.addEventListener('online', tick);
  window.addEventListener('offline', emit);
  tick();
}
