// POSTs outbox rows to the Google Apps Script web app.
// Endpoint + shared secret come from config; if endpoint is blank the
// adapter no-ops (useful for local dev / unconfigured installs).

export async function pushRow(endpoint, sharedSecret, row) {
  if (!endpoint) {
    // No backend configured — pretend success so the row leaves the outbox
    // ONLY if Raahim flips an explicit "drop unsynced" flag. Default is to
    // keep retrying, so we throw here.
    throw new Error('sheets endpoint not configured');
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain', // Apps Script web apps prefer text/plain to avoid CORS preflight
      'x-shared-secret': sharedSecret || '',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`sheets push failed: HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data.ok === false) throw new Error(data.error || 'sheets push rejected');
  return data;
}
