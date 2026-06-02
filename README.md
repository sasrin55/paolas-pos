# Paolas POS

Touch-first, **offline-first** Point-of-Sale for Paolas restaurant. Part of the [Seated](https://seated.pk) platform — every closed bill writes to a Google Sheet so it can later join reservation data (`Bills.table + Bills.date ↔ reservations`) to build per-guest spend profiles.

Built with React + Tailwind. Local data lives in IndexedDB; an outbox queue syncs to Google Sheets via an Apps Script web app.

## Run

```bash
cd paolas-pos
npm install
npm run dev
# → http://localhost:5173
```

Replit: hit **Run**. The `.replit` file already points at `npm run dev`.

## Test PINs (dev only — change before launch)

| User  | Role    | PIN  |
|-------|---------|------|
| Sara  | manager | 9999 |
| Ali   | waiter  | 1111 |
| Bilal | waiter  | 2222 |

Sign in as a waiter to take orders; manager PIN gates the sensitive actions (voids, discounts, 86-toggle, force-free, EOD close).

## What's in v1

- **Floor view** — 12 tables, status (free / occupied / bill-requested), tap to open an order. Right-click or "⋯" for table actions: transfer, merge, force-free, mark-bill-requested.
- **Menu grid** — 15 placeholder items across 5 categories, with **modifier groups** (size, toppings, spice, temperature, doneness, bread extras). **Long-press an item to 86** (manager-gated for waiters).
- **Order entry** — qty, modifiers, kitchen notes, live running total. New (un-fired) lines are tagged so you know what to send.
- **KOT print** — "Fire KOT" prints a kitchen ticket (80mm thermal CSS). Only un-sent lines fire.
- **Bill math** — subtotal, % discount (manager-gated), comp, service charge, **tender-aware tax**. Math is pure and lives in `src/lib/bill-math.js`.
- **Split** — by item (forks a new bill on the same table) or by # people (informational; collect via multi-tender at payment).
- **Merge / transfer** — full-fledged actions, audit-logged.
- **Multi-tender payments** — cash, card, easypaisa, JazzCash, Raast. Split tender (part cash, part card). Tax is computed proportionally per tender.
- **Receipt print** — 80mm thermal, restaurant name/address/GST, itemized lines, tender breakdown, **FBR/PRA invoice number slot + QR**.
- **Sign-in + manager PIN** — SHA-256 + per-user salt (`src/lib/pin.js`). Audit-logged on every gated action.
- **Settings sheet** — restaurant info, tender-aware tax rates (cash / card / wallet), service charge, Sheets endpoint + secret, FBR config.
- **End-of-day + cash reconciliation** — closed bills today, by-tender breakdown, void count, expected cash vs counted, variance, print/export.
- **Offline-first** — works fully without internet. Everything writes to IndexedDB first, then to an outbox queue that drains to Sheets when online. Header pill shows `Online · 0 queued` / `Offline · N queued`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (components/)                                     │
│   - never imports IndexedDB or fetch() directly             │
└──────────────┬──────────────────────────────────────────────┘
               │ only path: imports from data-layer/index.js
               ▼
┌─────────────────────────────────────────────────────────────┐
│  data-layer/index.js  ← THE clean interface                 │
│   - listMenu / listTables / saveBill / savePayment / …      │
│   - every write: local-store FIRST, then enqueue            │
└──────────────┬──────────────────────────────────────────────┘
               │
   ┌───────────┴──────────────┐
   ▼                          ▼
┌──────────────────┐   ┌──────────────────────────────────┐
│ local-store.js   │   │ sync-queue.js                    │
│ IndexedDB stores │   │ outbox drainer (online + 30s)    │
│ mirror tabs 1:1  │   │ exponential backoff per row      │
└──────────────────┘   └──────────────┬───────────────────┘
                                      ▼
                       ┌──────────────────────────────────┐
                       │ sheets-adapter.js                │
                       │ POST → Apps Script web app       │
                       └──────────────┬───────────────────┘
                                      ▼
                              Google Sheets tabs
```

**The whole point** of this shape: the UI never blocks on the network, and the day we replace Sheets with Supabase/Postgres, we touch `data-layer/sheets-adapter.js` and nothing else.

## Data model (mirrors Sheet tabs)

- **Menu**: `item_id, category, name, price_pkr, available, modifier_group_ids`
- **Modifiers** + **modifierGroups** (split for clean joins)
- **Tables**: `table_id, label, capacity, zone, status, active_bill_id`
- **Users**: `user_id, name, role, salt, pin_hash` (never raw PIN)
- **Bills**: `bill_id, date, time_opened, time_closed, table, table_label, pax, service_mode, server_id, server_name, subtotal, discount, comp, service_charge, tax, total, status, fbr_invoice_number`
- **BillItems**: `line_id, bill_id, item_id, item_name, qty, unit_price, modifiers, line_total, note, sent_to_kitchen, voided_by`
- **Payments**: `payment_id, bill_id, tender_type, amount_pkr, time` (multiple rows = split tender)
- **AuditLog**: `log_id, time, user_id, action, bill_id, detail` (voids, comps, discounts, 86, transfer, merge, force-free, close-bill, EOD close)

**The join that matters downstream:** `Bills.table + Bills.date ↔ reservations`. Keep `date`, `table`, `time_opened`, `time_closed` clean.

## Quality bar — how each principle is satisfied in v1

1. **Speed under load.** Live order + bill math is pure React state on top of IndexedDB. Zero network in the hot path.
2. **Works offline.** Everything is local-first. Mutations write to IndexedDB synchronously, sync queue drains in the background. Tested by going airplane-mode → still operational.
3. **Trivial to learn.** Tap a table → tap items → tap "Pay & close". The whole flow takes 4 taps in the happy path.
4. **Theft-proof.** Voids, discounts, 86-toggle (for waiters), force-free, EOD close → all manager-PIN gated, all audit-logged.
5. **Numbers the owner trusts.** Bill math is pure and dependency-free (`src/lib/bill-math.js`). EOD checks `total collected == net sales` and surfaces a red warning if not.
6. **Hardware fit.** 48px tap targets, 80mm thermal CSS for KOT + receipt, works at tablet width.

## Wiring the Sheets backend (Phase 5/10 of the build)

1. Create a Google Sheet with tabs matching the data model (column names above).
2. In the Sheet: Extensions → Apps Script. Paste a `doPost` handler that:
   - Reads `x-shared-secret` header, compares to script property.
   - Parses `{ action, payload }` from the body.
   - Routes to `upsertMenu` / `upsertTable` / `upsertBill` / `upsertBillItem` / `upsertPayment` / `appendAudit`.
   - Returns `{ ok: true }` or `{ ok: false, error }`.
3. Deploy as a Web App, "Execute as: me", "Access: anyone with the link".
4. In POS Settings → Sheets sync: paste the `/exec` URL + your shared secret. Hit **Drain outbox now** to test.

The outbox shows up in DevTools → Application → IndexedDB → `paolas_pos` → `outbox` if you want to inspect a stuck row.

## Pakistan specifics

- **PKR** with thousands separators.
- **Tax is configurable and tender-aware.** Three rate slots: cash / card / wallet. For split-tender bills, tax is computed per tender weighted by that tender's amount.
- **Wallets** (easypaisa, JazzCash, Raast) are first-class tender types alongside cash + card.
- **FBR/PRA e-invoicing**: Paolas already e-invoices. The receipt prints an invoice number slot now (auto-generated from bill ID until the live integration is wired). Configure under Settings → FBR/PRA.
- **Load-shedding / wifi drops** are why offline-first is non-negotiable.

## Folder map

```
src/
├── App.jsx                         shell composition + page-level state
├── main.jsx                        React entrypoint
├── styles.css                      Tailwind + print CSS
├── components/
│   ├── Header.jsx                  online/queued pill, user, settings, EOD
│   ├── FloorView.jsx               table grid + actions menu (transfer/merge/force-free)
│   ├── OrderPanel.jsx              active order, bill math, fire KOT, split, pay
│   ├── MenuGrid.jsx                categories + items, long-press 86 toggle
│   ├── ModifierPicker.jsx          group-aware picker (required/multi/single)
│   ├── SplitBillSheet.jsx          by-item or by-people
│   ├── PaymentSheet.jsx            multi-tender + close bill + receipt print
│   ├── TransferMergeSheet.jsx      move/merge open bills across tables
│   ├── SettingsSheet.jsx           restaurant, tax, service, sheets, FBR
│   ├── EODReport.jsx               daily totals, by-tender, cash reconciliation
│   ├── SignIn.jsx                  user list + PIN pad
│   ├── ManagerPinModal.jsx         gates the audit-logged actions
│   ├── PinPad.jsx                  numeric keypad
│   └── Modal.jsx                   generic modal/sheet
├── data-layer/
│   ├── index.js                    PUBLIC API — UI imports only this
│   ├── local-store.js              IndexedDB wrapper
│   ├── sync-queue.js               outbox drainer w/ backoff
│   └── sheets-adapter.js           POSTs to Apps Script (swappable)
├── lib/
│   ├── config.js                   defaults, tender list, service modes
│   ├── format.js                   PKR formatting
│   ├── bill-math.js                pure totals (testable in isolation)
│   ├── pin.js                      SHA-256 + per-user salt
│   ├── id.js                       human-readable bill/line/payment IDs
│   └── print.js                    KOT + receipt thermal templates
├── state/
│   └── AppContext.jsx              app-wide context (config, users, sync, current user)
└── data/
    └── seed.js                     first-boot seed (menu, modifiers, tables, users)
```

## What's deliberately deferred (Tier 3)

- Kitchen display screen (KDS) — KOT print covers v1.
- Inventory deduction.
- Real payment processing (moving money). Tenders are recorded only.
- **Live FBR/PRA push.** Slots exist; toggle `Settings → FBR → Integration live` once wired.
- Sales reports by item/category/server/daypart (Tier 2).
- Shift management (Tier 2).
- Customer/guest attach by phone (Tier 2 — this is what unlocks the explicit Seated join).

## What to do before going live

1. Change all three test PINs.
2. Set restaurant address, phone, GST in Settings.
3. Confirm PRA tax rates (cash / card / wallet) and enable tax.
4. Deploy the Apps Script web app, paste endpoint + shared secret in Settings.
5. Test airplane-mode → take a full order → close it → reconnect → verify it drains to the Sheet.
6. Verify a closed bill's `table` + `date` match a real reservation row exactly (the downstream join).
