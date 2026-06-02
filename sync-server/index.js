// Paolas POS LAN sync hub. One instance per restaurant — runs on the cashier
// till (or any always-on device). All POS clients on the local network
// connect to it via WebSocket and broadcast mutations to peers.
//
// Run locally:           node sync-server/index.js
// Replit:                point another tab at ws://<repl-url>:3001
// Env:                   PORT (default 3001), TOKEN (optional bearer)

import { WebSocketServer } from 'ws';
import http from 'http';

const PORT  = Number(process.env.PORT  || 3001);
const TOKEN = process.env.TOKEN || '';

const server = http.createServer((req, res) => {
  // tiny health probe
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Paolas POS sync hub\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // optional bearer token
  if (TOKEN) {
    const url = new URL(req.url, 'http://x');
    const t = url.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer\s+/, '') || '';
    if (t !== TOKEN) { ws.close(1008, 'unauthorized'); return; }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    // broadcast to all OTHER connected clients
    for (const peer of wss.clients) {
      if (peer === ws) continue;
      if (peer.readyState !== 1) continue;
      try { peer.send(JSON.stringify(msg)); } catch {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`[paolas-pos sync] listening on ws://0.0.0.0:${PORT}`);
  if (TOKEN) console.log(`[paolas-pos sync] bearer token required`);
});
