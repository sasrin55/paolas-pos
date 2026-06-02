# Paolas POS

Touch-first, **offline-first, real-time** Point-of-Sale for Paolas restaurant. Part of the [Seated](https://seated.pk) platform — every closed bill writes to a Google Sheet and to a **per-customer record** so it can later join reservation data (`Bills.table + Bills.date ↔ reservations`, plus the direct `Bills.customer_id ↔ Customers` link) to build guest spend profiles.

React + Tailwind. Local data in IndexedDB. **Multi-device sync** over LAN WebSockets so handhelds + the cashier till + (later) the kitchen display see writes live. Outbox queue syncs to Google Sheets via an Apps Script web app.

## Run

```bash
cd paolas-pos
npm install

# Terminal 1: the POS UI
npm run dev          # → http://localhost:5173

# Terminal 2 (on the cashier till only): the LAN sync hub
npm run sync         # → ws://0.0.0.0:3001 (health: http://localhost:3001/health)
```

Replit: hit **Run**. Add a second tab running `npm run sync` if you need multi-device sync.

On the **waiter handhelds**, open Settings → Real-time sync, paste `ws://<till-ip-on-LAN>:3001`. The header gets a `LAN sync` pill when connected.

## Test PINs (dev only — change before launch)

| User  | Role    | PIN  |
|-------|---------|------|
| Sara  | manager | 9999 |
| Ali   | waiter  | 1111 |
| Bilal | waiter  | 2222 |

## What's in v1 (all Tier-1 features)

- **Floor view** — tables, status (free / occupied / bill-requested), table-action menu (transfer / merge / force-free).
- **Menu** — categories, modifier groups (size/toppings/spice/temp/doneness), **item images**, **long-press 86 toggle** (manager-PIN for waiters, audit-logged).
- **Order entry** — qty, modifiers, kitchen note, **price override** (manager-PIN, audit-logged), live total.
- **KOT print** — 80mm thermal CSS; only un-fired lines print.
- **Bill math** — pure (`src/lib/bill-math.js`), tender-aware tax.
- **Customer attach** — type a phone, live search, see prior visits / spend / loyalty points; attach to bill. New customer? Create + attach in one tap.
- **Customer record updates on bill close** — visit_count++, total_spend_pkr+=, last_visit, loyalty points earned per Settings rate.
- **Multi-tender payments** — cash / card / easypaisa / JazzCash / Raast. Split tender. Tax recomputed tender-weighted.
- **Receipt** — 80mm thermal, restaurant/GST, lines, breakdown, tender, **FBR/PRA invoice slot** (auto-generated until live integration toggled on).
- **Split / merge / transfer** — full flows, audit-logged.
- **Sign-in + manager PIN** — SHA-256 + salt; voids, discounts, 86, price-override, force-free, EOD close all gated.
- **Settings** — restaurant info, tender-aware tax (cash/card/wallet), service charge, loyalty rate, language, LAN sync URL, Sheets endpoint + secret, FBR config.
- **End-of-day + cash reconciliation** — today's closed bills, by-tender, void count, expected cash vs counted, variance, print + audit-log close-day.
- **Offline-first** — full IndexedDB local-first; outbox drains to Sheets when online; header shows `Online / Offline · N queued`.
- **Real-time multi-device sync (Phase 12)** — LAN WebSocket hub. Writes broadcast peer-to-peer; receivers apply silently. Header shows `LAN sync` when connected.
- **i18n scaffold** — `t()` + `src/lib/strings/en.json`. Drop a `ur.json` in to enable Urdu (Settings → Language). RTL flips via the `<html dir>` attribute automatically.

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
│   every write: local → broadcast(LAN peers) → enqueue(Sheets)│
└──────┬───────────────┬───────────────────┬──────────────────┘
       ▼               ▼                   ▼
┌──────────────┐ ┌────────────────┐ ┌─────────────────────────┐
│ local-store  │ │ sync-client.js │ │ sync-queue.js           │
│ IndexedDB    │ │ ws ↔ LAN hub   │ │ outbox drainer (backoff)│
└──────────────┘ └────────┬───────┘ └────────────┬────────────┘
                          ▼                      ▼
                 ┌──────────────────┐  ┌──────────────────────┐
                 │  sync-server/    │  │ sheets-adapter.js    │
                 │  Node ws hub     │  │ POST → Apps Script   │
                 │  npm run sync    │  └──────────┬───────────┘
                 └──────────────────┘             ▼
                                          Google Sheets tabs
```

**Two sync layers, complementary:**
- **LAN sync (Phase 12)** = real-time, in-restaurant. Survives load-shedding because everyone's local-first; only the till needs UPS power.
- **Sheets sync** = eventual record-of-truth + downstream Seated joins.

**Swappability promise:** the day we move authoritative state to Supabase, we replace `sheets-adapter.js` + `sync-client.js` and nothing else. The UI doesn't notice.

## Data model (mirrors Sheet tabs)

- **Menu**: `item_id, category, name, price_pkr, available, image_url, modifier_group_ids`
- **modifierGroups** + **Modifiers** (split for clean joins)
- **Tables**: `table_id, label, capacity, zone, status, active_bill_id`
- **Users**: `user_id, name, role, salt, pin_hash`
- **Customers**: `customer_id, phone, name, first_visit, last_visit, visit_count, total_spend_pkr, tags, notes, loyalty_points` ← **the Seated record**
- **Bills**: `bill_id, date, time_opened, time_closed, table, table_label, pax, service_mode, server_id, server_name, customer_id, customer_phone, customer_name, subtotal, discount, comp, service_charge, tax, total, status, fbr_invoice_number`
- **BillItems**: `line_id, bill_id, item_id, item_name, qty, unit_price, modifiers, line_total, note, sent_to_kitchen, voided_by, price_overridden`
- **Payments**: `payment_id, bill_id, tender_type, amount_pkr, time`
- **Shifts**: `shift_id, user_id, clock_in, clock_out, opening_cash, closing_cash, sales_total` (table exists; UI is Tier 2)
- **AuditLog**: `log_id, time, user_id, action, bill_id, detail`

**Two joins downstream:**
1. **Direct**: `Bills.customer_id → Customers` — guest profile, immediate.
2. **Fallback**: `Bills.table + Bills.date → reservation` — recovers identity when no phone was attached.

## Quality bar — how each principle is satisfied

1. **Speed under load.** Order + bill math is pure React state on IndexedDB. Zero network in the hot path.
2. **Works offline.** Everything local-first. Outbox queue drains when online; LAN peers reconcile when reconnected.
3. **Trivial to learn.** Tap a table → tap items → **Pay & close**. i18n scaffold ready for Urdu.
4. **Theft-proof.** Voids, discounts, 86, **price overrides**, force-free, EOD close → all manager-PIN gated, all audit-logged.
5. **Numbers the owner trusts.** Pure bill math. EOD red-flags if `collected ≠ net sales`.
6. **Hardware fit.** 48px tap targets, 80mm thermal CSS, works at tablet width.

## Devices

Paolas day-one setup: **1 cashier till + 1–2 waiter handhelds**.

- The till runs both `npm run dev` *and* `npm run sync`. It is the LAN sync hub.
- Handhelds run only `npm run dev` (or load the till's URL) and have `ws://<till>:3001` in Settings.
- All devices stay independently functional if the LAN drops — they catch up when it returns.

## Wiring the Sheets backend

1. Create a Google Sheet with tabs matching the data model.
2. Extensions → Apps Script. Paste a `doPost` that:
   - Reads `x-shared-secret` header.
   - Parses `{ action, payload }`.
   - Routes to `upsertMenu / upsertTable / upsertCustomer / upsertBill / upsertBillItem / upsertPayment / upsertShift / appendAudit`.
   - Returns `{ ok: true }` or `{ ok: false, error }`.
3. Deploy as Web App, "Execute as: me", "Access: anyone with the link".
4. Settings → Sheets sync: paste the `/exec` URL + your shared secret. **Drain outbox now** to test.

## Pakistan specifics

- **PKR** with thousands separators.
- **Tax is tender-aware** (cash / card / wallet — three settings slots). Per-tender weighting on split-tender bills.
- **Wallets**: easypaisa, JazzCash, Raast as first-class tenders.
- **FBR/PRA**: Paolas already e-invoices; receipt prints an invoice slot now (auto-generated from bill ID until the live integration is wired). Toggle `Settings → FBR → Integration live` once wired.
- **Load-shedding**: the till runs on UPS so the LAN hub stays up during outages. POS clients are local-first anyway.
- **Urdu UI**: scaffolded, English ships v1.

## Folder map

```
paolas-pos/
├── sync-server/
│   └── index.js                LAN ws hub (run on cashier till)
├── src/
│   ├── App.jsx                 shell composition + page-level state
│   ├── main.jsx
│   ├── styles.css
│   ├── components/
│   │   ├── Header.jsx          online/queued pill, LAN sync pill, user
│   │   ├── FloorView.jsx       table grid + actions
│   │   ├── OrderPanel.jsx      active order, bill math, attach customer, override
│   │   ├── MenuGrid.jsx        categories, item images, long-press 86
│   │   ├── ModifierPicker.jsx
│   │   ├── CustomerSheet.jsx   phone search, create, history
│   │   ├── SplitBillSheet.jsx  by-item + by-people
│   │   ├── PaymentSheet.jsx    multi-tender + close + customer-record update
│   │   ├── TransferMergeSheet.jsx
│   │   ├── SettingsSheet.jsx   restaurant, tax, service, loyalty, language, LAN, sheets, FBR
│   │   ├── EODReport.jsx       daily totals, by-tender, cash reconciliation
│   │   ├── SignIn.jsx
│   │   ├── ManagerPinModal.jsx
│   │   ├── PinPad.jsx
│   │   └── Modal.jsx
│   ├── data-layer/
│   │   ├── index.js            PUBLIC API
│   │   ├── local-store.js      IndexedDB wrapper (v2 schema: + customers + shifts)
│   │   ├── sync-queue.js       outbox drainer
│   │   ├── sync-client.js      LAN ws peer client
│   │   └── sheets-adapter.js   POSTs to Apps Script
│   ├── lib/
│   │   ├── config.js           defaults, tender list, service modes
│   │   ├── format.js
│   │   ├── bill-math.js        pure totals (testable in isolation)
│   │   ├── pin.js              SHA-256 + salt
│   │   ├── id.js               human-readable IDs
│   │   ├── print.js            KOT + receipt thermal templates
│   │   ├── i18n.js             t() / setLocale / RTL helpers
│   │   └── strings/en.json     English bundle
│   ├── state/
│   │   └── AppContext.jsx      app-wide context (config, users, customers, sync, realtime, current user, locale)
│   └── data/
│       └── seed.js             menu + modifiers + tables + users
└── README.md
```

## What's deliberately deferred

- **Tier 2**: Back Office (web) for menu/customer/staff admin, full loyalty UI, sales-by-x reports, employee shifts/time clock, multi-station routing, CDS.
- **Tier 3**: KDS, inventory deduction, real card processing, **live FBR/PRA push** (slot exists; flip integration_live when wired).

## Pre-launch checklist

1. Change all three test PINs in `src/data/seed.js`.
2. Settings → restaurant address + phone + GST.
3. Settings → tax rates confirmed with accountant; enable tax.
4. Settings → service charge rate if applicable.
5. Deploy Apps Script web app + paste endpoint + shared secret in Settings.
6. On the till: `npm run sync` and confirm `http://localhost:3001/health` returns `{"ok":true}`.
7. On handhelds: Settings → LAN sync URL. Confirm header pill goes solid.
8. Airplane-mode test: full order → close → re-enable network → confirm Sheets drain.
9. Verify a closed bill's `(table, date)` matches a real reservation row exactly.
10. (When live) Toggle FBR integration_live and verify a real invoice number prints.
