// Real-time peer sync (Phase 12). One device on the LAN runs the
// sync-server (see /sync-server). Every other tablet connects to it; writes
// broadcast to peers and are applied silently to each peer's local store.
//
// Trade-off accepted for v1: last-write-wins per row by ID. Conflict resolution
// gets smarter once the data layer moves to Postgres/Supabase.

let ws = null;
let url = '';
let clientId = '';
let queue = [];           // outbound while disconnected
let listeners = new Set();
let stateListeners = new Set();
let connected = false;
let reconnectTimer = null;

function emitState() {
  stateListeners.forEach((cb) => cb({ connected, url }));
}

export function onRealtimeState(cb) {
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
}

export function onRealtimeMessage(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function startRealtime(serverUrl) {
  if (!serverUrl) return;
  if (ws && url === serverUrl) return;
  if (!clientId) {
    clientId = 'C-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  url = serverUrl;
  closeSocket();
  connect();
}

function connect() {
  try {
    ws = new WebSocket(url);
  } catch (e) {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    connected = true;
    emitState();
    // flush outbound queue
    while (queue.length) {
      const m = queue.shift();
      try { ws.send(JSON.stringify(m)); } catch {}
    }
    // ask for a snapshot of current state from peers (best-effort)
    try { ws.send(JSON.stringify({ type: 'hello', client_id: clientId })); } catch {}
  };
  ws.onclose = () => {
    connected = false;
    emitState();
    scheduleReconnect();
  };
  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.client_id === clientId) return;  // our own echo
    if (msg.type === 'mutation') {
      listeners.forEach((cb) => cb(msg));
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
}

function closeSocket() {
  if (ws) { try { ws.close(); } catch {} ws = null; }
}

export function broadcast(store, payload, op = 'put') {
  if (!url) return;
  const msg = {
    type: 'mutation',
    client_id: clientId,
    store,
    op,
    payload,
    time: Date.now(),
  };
  if (connected && ws?.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch { queue.push(msg); }
  } else {
    queue.push(msg);
    // cap to avoid unbounded growth
    if (queue.length > 500) queue.splice(0, queue.length - 500);
  }
}
