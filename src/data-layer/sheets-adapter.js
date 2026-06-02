// POSTs outbox rows to the Google Apps Script web app.
// Endpoint + shared secret come from config; if endpoint is blank the
// adapter no-ops (the row stays in the outbox).
//
// Apps Script web apps don't reliably forward custom request headers to the
// script handler, so we put the shared secret in the request BODY too. The
// backend checks body.shared_secret first.

export async function pushRow(endpoint, sharedSecret, row) {
  if (!endpoint) throw new Error('sheets endpoint not configured');
  const body = JSON.stringify({
    shared_secret: sharedSecret || '',
    queue_id: row.queue_id,
    action: row.action,
    payload: row.payload,
    created_at: row.created_at,
  });
  const res = await fetch(endpoint, {
    method: 'POST',
    // text/plain avoids the CORS preflight that Apps Script doesn't answer.
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  if (!res.ok) throw new Error(`sheets push failed: HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data.ok === false) throw new Error(data.error || 'sheets push rejected');
  return data;
}
