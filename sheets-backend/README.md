# Paolas POS — Sheets backend

This is the Apps Script web app that receives outbox rows from the POS and writes them into a Google Sheet. It's the persistent record-of-truth for Paolas; the POS itself is local-first IndexedDB.

## Deploy (one time, ~5 minutes)

1. Create a new Google Sheet (or use an existing one). The Sheet's owner becomes the data owner.
2. Extensions → Apps Script.
3. Delete the default `Code.gs` content; paste the contents of this folder's [Code.gs](Code.gs).
4. At the top of the script, change:
   ```js
   const SHARED_SECRET = 'CHANGE_ME_BEFORE_DEPLOYING';
   ```
   to a random string. Keep it — the POS needs the exact same value.
5. In the script editor, pick the function `setupTabs` from the dropdown and click **Run**. Authorise the script when prompted. This creates all 11 tabs (Menu / ModifierGroups / Modifiers / Tables / Users / Customers / Bills / BillItems / Payments / Shifts / AuditLog) with their headers.
6. Deploy → **New deployment** → type **Web app**.
   - Description: `paolas-pos-backend v1`
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
   - Click **Deploy**.
7. Copy the resulting `/exec` URL.

## Wire to the POS

In the POS UI:
- ⚙ Settings → Sheets sync
  - Endpoint URL: paste the `/exec` URL
  - Shared secret: paste the same string you set in `Code.gs`
- Click **Drain outbox now** to push any queued rows.

You can also visit the `/exec` URL in a browser as a health check — it returns `{"ok":true,"hint":"Paolas POS sheets backend"}`.

## What the backend does

| Action from POS         | Tab written to | Behavior                                  |
|-------------------------|----------------|-------------------------------------------|
| `upsertMenu`            | Menu           | Upsert by `item_id`                       |
| `upsertModifierGroup`   | ModifierGroups | Upsert by `group_id`                      |
| `upsertModifier`        | Modifiers      | Upsert by `modifier_id`                   |
| `upsertTable`           | Tables         | Upsert by `table_id`                      |
| `upsertUser`            | Users          | Upsert by `user_id`                       |
| `upsertCustomer`        | Customers      | Upsert by `customer_id`                   |
| `upsertBill`            | Bills          | Upsert by `bill_id`                       |
| `upsertBillItem`        | BillItems      | Upsert by `line_id`                       |
| `deleteBillItem`        | BillItems      | Delete row matching `line_id`             |
| `upsertPayment`         | Payments       | Upsert by `payment_id` (refunds = negative `amount_pkr`) |
| `upsertShift`           | Shifts         | Upsert by `shift_id`                      |
| `appendAudit`           | AuditLog       | Append-only (never updated)               |

## Idempotency

The POS retries failed pushes with exponential backoff. The backend handles this by:
- Upserts: match on the primary key column; existing rows update in place.
- `deleteBillItem`: if the row is already gone, the delete is a no-op.
- `appendAudit`: log_id is generated client-side; if the same log_id arrives twice, you'll get a duplicate row. (Acceptable — audit duplicates are easy to dedupe in reports and safer than missed rows.)

## Schema notes

- Arrays and objects (e.g. `modifiers` on a BillItem, `modifier_group_ids` on Menu) are stored as JSON strings. The POS reads them back via `JSON.parse`. Don't edit those cells by hand unless you know what you're doing.
- Every row that needs it carries an `outlet_id`. Single-outlet for now — future-proof.
- `Bills.status` enum: `new | running | due | settled | void`.
- `Payments.is_refund: true` means the `amount_pkr` is negative.

## Security model

- Shared secret comes through in the POST body (Apps Script web apps don't reliably expose custom headers, so we don't depend on the `x-shared-secret` header). Any request without the right secret is rejected with `{"ok":false,"error":"unauthorised"}`.
- The web app runs as **you** (the deployer). Anyone with the URL + secret can write — protect both.
- For tighter security later: rotate the secret quarterly; restrict the Sheet's edit permissions to script accounts only.

## Troubleshooting

- **`unauthorised`** — POS Settings shared secret doesn't match `SHARED_SECRET` in Code.gs.
- **`unknown action: X`** — the POS sent an action the backend hasn't been updated to handle. Pull the latest Code.gs.
- **Cells show `[object Object]`** — you edited a row by hand and broke a JSON-stringified column. Re-push from the POS will overwrite it cleanly.
- **Nothing arriving** — check `npm run sync` / `LAN sync` is separate; this is the Sheets path. Open DevTools → IndexedDB → `paolas_pos` → `outbox` to see queued rows. Drain failures store `last_error` on each row.
