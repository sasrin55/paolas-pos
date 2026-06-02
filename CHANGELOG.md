# Paolas POS — changelog

A running record of what each push added. Tier and gap references map back to the [v4 spec audit](https://github.com/sasrin55/paolas-pos/blob/main/README.md).

---

## v4.2 — Tier-1 gap close-out (2026-06-02)

Closes five of the gaps surfaced in the audit. Same data model, additive UI.

### Added

- **Comp action UI** ([OrderPanel.jsx](src/components/OrderPanel.jsx))
  - Comp Rs input + Apply comp button next to discount.
  - Manager-gated, required reason, audit action `comp`.

- **In-POS menu editor** ([MenuEditor.jsx](src/components/MenuEditor.jsx))
  - List + search + per-item editor (name, price, category, image preview, available, modifier groups).
  - New Header **Menu** button.
  - Save and Delete are manager-gated with required reason. Audit actions: `menu_create`, `menu_edit`, `menu_delete`.
  - data-layer: new `deleteMenuItem` (local + broadcast).

- **House-account viewer + settle** ([HouseAccountsSheet.jsx](src/components/HouseAccountsSheet.jsx))
  - Lists customers with non-zero `house_account_balance`, descending.
  - Settle flow with tender choice + amount (Full balance / Half shortcuts).
  - Records a settlement `Payment` row (`bill_id=''`, `customer_id`, `is_settlement: true`), decrements the balance, writes audit `house_account_settle` with required reason.
  - New Header **House** button.

- **Loyalty redemption** ([PaymentSheet.jsx](src/components/PaymentSheet.jsx))
  - `config.loyalty.pkr_per_point` (default 1 pt = Rs 1).
  - `bill-math.computeBill` accepts `loyalty_redeemed_pkr`.
  - PaymentSheet shows the redemption row when an attached customer has points; **Use all** shortcut.
  - Closed bills now store `loyalty_redeemed_pkr` + `loyalty_redeemed_points`.
  - On close, customer record deducts redeemed points before adding fresh earn.

- **Takeaway / delivery prompts** ([NonTableStartSheet.jsx](src/components/NonTableStartSheet.jsx))
  - `+ Takeaway` requires phone.
  - `+ Delivery` requires phone + address; scheduled-for time is optional.
  - Live customer lookup by phone shows prior visits inline.
  - New bills carry `customer_id`, `customer_phone`, `customer_name`, `delivery_address`, `scheduled_for`. Seated guest record is now built from the very first order, not deferred to payment.

### Changed

- `config.loyalty.pkr_per_point` defaulted to 1.
- `bill-math.computeBill` return shape adds `loyalty`.
- `Bills` schema: new optional fields `loyalty_redeemed_pkr`, `loyalty_redeemed_points`, `delivery_address`, `scheduled_for`.
- `Payments` schema: new optional fields `is_settlement`, `customer_id`.

---

## v4.1 — Apps Script backend + dev fixes (2026-06-02)

### Added

- **`sheets-backend/Code.gs`** + setup README — the previously-missing backend code the POS adapter posts to. doPost handler with idempotent upserts per tab and a `setupTabs()` one-shot that creates all 11 tabs with the right headers.
- **ErrorBoundary** ([ErrorBoundary.jsx](src/components/ErrorBoundary.jsx)) — top-level boundary so a render crash shows a dark panel with stack trace + a **Reset local data and reload** button, instead of a silent white screen.
- **Dev-mode PIN bypass** — `config.auth_disabled = true` default. AppContext auto-signs-in the first manager. ManagerPinModal auto-approves and audit-logs with reason `(pins disabled)`. Settings → Authentication has a toggle to turn the gates back on before launch.

### Changed

- `sheets-adapter.js` now sends the shared secret in the request body (Apps Script web apps don't reliably forward custom headers).
- Fixed a temporal-dead-zone bug in `config.js` (`DEFAULT_OUTLET_ID` declared before `DEFAULT_CONFIG`).
- `OrderPanel` early null-check widened so takeaway/delivery bills (no table) render correctly.

---

## v4.0 — Order lifecycle state machine + multi-outlet (2026-06-02)

### Added

- **Order lifecycle** ([lifecycle.js](src/lib/lifecycle.js)) — every bill is a state machine: `new → running → due → settled` plus six exception transitions: **void / reduce / replace / refund / reprint / recall**. Every exception is manager-gated *and* requires a reason; both written to AuditLog.
- **ManagerPinModal: reason field** — contextual suggestion chips per action, required-reason mode blocks until both reason + PIN supplied.
- **Per-line actions menu** (OrderPanel) — Reduce qty, Replace item, Override price, Void.
- **Void whole bill** — deletes lines, sets `status: void`, frees the table.
- **[BillHistorySheet.jsx](src/components/BillHistorySheet.jsx)** — today's settled/void bills with **Reprint**, **Refund** (any tender, negative payment row, `is_refund: true`), **Recall** (status → running, reattach to table if free). All three gated.
- **Tips** in PaymentSheet — quick-pick 5/10/15% + custom; stored as `tip_pkr`.
- **New tenders** — `online-transfer`, `house-account`. House-account requires attached customer; adds to `Customers.house_account_balance`.
- **Takeaway / Delivery** quick-start buttons on the floor.
- **Multi-outlet future-proof** — `outlet_id` on Menu, Tables, Users, Customers, Bills, BillItems, Payments, Shifts. Default `PAOLAS`.

### Changed

- Legacy status migration: old `open` / `closed` / `merged` bills now normalize to `running` / `settled` / `void` on read; EOD + CustomerSheet query `status === 'settled'`.

---

## v3 — Customer DB + LAN real-time sync (2026-06-02)

### Added

- **Customers IndexedDB store** (schema v2): customer_id, phone, name, first/last visit, visit_count, total_spend_pkr, tags, notes, loyalty_points, house_account_balance.
- **CustomerSheet** — phone search w/ live match, create + attach in one tap, recent visits inline.
- **PaymentSheet → Customers** — close bill updates the customer record (visit_count++, total_spend_pkr+=, last_visit, loyalty_points accrued).
- **Item images** on Menu rows + rendered in MenuGrid.
- **i18n scaffold** ([i18n.js](src/lib/i18n.js)) + `en.json`. Urdu later via `ur.json`.
- **Real-time LAN sync (Phase 12)** — Node ws hub at [sync-server/index.js](sync-server/index.js) + [sync-client.js](src/data-layer/sync-client.js). Header gets a `LAN sync` pill when connected.
- **Manager-gated price override** per line.
- Loyalty rate (points per PKR) in Settings.

---

## v2 — Initial v1 POS shell (2026-06-02)

First push to `sasrin55/paolas-pos`. Vite + React + Tailwind. Local-first IndexedDB. Sync queue + Apps Script adapter (then stub-only). Menu + modifiers + 86. Floor + status. Order entry. KOT print. Tender-aware tax. Multi-tender payments (cash/card/easypaisa/JazzCash/Raast). Receipt with FBR slot. Split/merge/transfer. Manager PIN + audit log. EOD + cash reconciliation. Settings persistence. Sign-in/roles.

---

## Backlog (not yet landed)

- **RMS → POS guest context at the table.** Reservation match auto-populates the floor tile + order panel with guest identity + dietary notes + usual order *before* the waiter picks items. "Mr. Azam · 4 visits · usually sprite + lime · ⚠ NUT ALLERGY." Sourced from Seated RMS reservations + aggregated past `BillItems`. See [the plan file](https://github.com/sasrin55/paolas-pos/blob/main/CHANGELOG.md#backlog-not-yet-landed) for the implementation sketch.
- **Flip `auth_disabled` off and verify every gate prompts** (PIN bypass is currently on by default for dev).
- **Airplane-mode + multi-device LAN end-to-end test.**
- **Tier 2**: Back Office (web), full loyalty management UI, CDS, sales-by-x reports, time clock + shifts, multi-station routing, curbside / third-party delivery flows.
- **Tier 3**: KDS, inventory, real card processing, live FBR/PRA push, online ordering ingest.
