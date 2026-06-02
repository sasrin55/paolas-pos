/**
 * Paolas POS — Google Apps Script backend
 *
 * Deploy this as a Web App ("Execute as: me", "Access: anyone with the link"),
 * then paste the /exec URL + the shared secret you set below into the POS
 * (Settings → Sheets sync).
 *
 * The POS sends outbox rows shaped like:
 *   { queue_id, action, payload, created_at, attempts, next_attempt_at }
 *
 * Each action maps to one tab. The handler is idempotent — re-pushing the
 * same payload (because the POS retried) won't double-write rows. We key
 * upserts by primary key per tab.
 *
 * One-time setup:
 *   1. Set SHARED_SECRET below to a random string (same value goes into POS Settings).
 *   2. Run setupTabs() once from the editor to create all tabs with headers.
 *   3. Deploy → New deployment → Web app → Execute as me + Anyone with the link.
 *   4. Paste the /exec URL into POS Settings → Sheets sync.
 */

// ---- CONFIG ----
const SHARED_SECRET = 'CHANGE_ME_BEFORE_DEPLOYING';

// ---- TAB SCHEMAS ----
// keyPath = the column that uniquely identifies a row (used for upserts).
// columns = ordered list of column headers (must match what the POS sends).
const SCHEMAS = {
  Menu: {
    keyPath: 'item_id',
    columns: ['item_id', 'outlet_id', 'category', 'name', 'price_pkr',
              'available', 'image_url', 'modifier_group_ids'],
  },
  ModifierGroups: {
    keyPath: 'group_id',
    columns: ['group_id', 'name', 'required', 'multi'],
  },
  Modifiers: {
    keyPath: 'modifier_id',
    columns: ['modifier_id', 'group', 'name', 'price_delta_pkr'],
  },
  Tables: {
    keyPath: 'table_id',
    columns: ['table_id', 'outlet_id', 'label', 'capacity', 'zone',
              'status', 'active_bill_id'],
  },
  Users: {
    keyPath: 'user_id',
    columns: ['user_id', 'outlet_id', 'name', 'role', 'salt', 'pin_hash'],
  },
  Customers: {
    keyPath: 'customer_id',
    columns: ['customer_id', 'outlet_id', 'phone', 'name',
              'first_visit', 'last_visit', 'visit_count', 'total_spend_pkr',
              'tags', 'notes', 'loyalty_points', 'house_account_balance'],
  },
  Bills: {
    keyPath: 'bill_id',
    columns: ['bill_id', 'outlet_id', 'date', 'time_opened', 'time_closed',
              'table', 'table_label', 'pax', 'service_mode',
              'server_id', 'server_name',
              'customer_id', 'customer_phone', 'customer_name',
              'subtotal', 'discount', 'comp', 'service_charge', 'tax',
              'tip_pkr', 'total', 'status', 'fbr_invoice_number',
              'discount_pct', 'comp_amount', 'merged_into', 'split_parent_id'],
  },
  BillItems: {
    keyPath: 'line_id',
    columns: ['line_id', 'bill_id', 'outlet_id', 'item_id', 'item_name',
              'qty', 'unit_price', 'modifiers', 'line_total',
              'note', 'sent_to_kitchen', 'voided_by', 'price_overridden'],
  },
  Payments: {
    keyPath: 'payment_id',
    columns: ['payment_id', 'bill_id', 'outlet_id', 'tender_type',
              'amount_pkr', 'time', 'is_refund'],
  },
  Shifts: {
    keyPath: 'shift_id',
    columns: ['shift_id', 'user_id', 'outlet_id', 'clock_in', 'clock_out',
              'opening_cash', 'closing_cash', 'sales_total'],
  },
  // AuditLog is append-only; no upsert. log_id is generated client-side.
  AuditLog: {
    keyPath: null,
    columns: ['log_id', 'time', 'user_id', 'action', 'bill_id',
              'reason', 'detail'],
  },
};

// ---- ACTION → HANDLER MAP ----
const ACTIONS = {
  upsertMenu:        (p) => upsert_('Menu', p),
  upsertModifierGroup:(p) => upsert_('ModifierGroups', p),
  upsertModifier:    (p) => upsert_('Modifiers', p),
  upsertTable:       (p) => upsert_('Tables', p),
  upsertUser:        (p) => upsert_('Users', p),
  upsertCustomer:    (p) => upsert_('Customers', p),
  upsertBill:        (p) => upsert_('Bills', p),
  upsertBillItem:    (p) => upsert_('BillItems', p),
  deleteBillItem:    (p) => deleteRow_('BillItems', 'line_id', p.line_id),
  upsertPayment:     (p) => upsert_('Payments', p),
  upsertShift:       (p) => upsert_('Shifts', p),
  appendAudit:       (p) => append_('AuditLog', p),
};

// ---- HTTP ENTRY POINT ----
function doPost(e) {
  try {
    if (!e || !e.postData) return reply_({ ok: false, error: 'no body' });

    const secret = (e.parameter && e.parameter.secret) ||
                   (e.headers && e.headers['x-shared-secret']) || '';
    // NB: Apps Script web apps don't expose custom headers reliably; secret
    // lives in the body too as a fallback.
    const body = JSON.parse(e.postData.contents);
    if ((body.shared_secret || secret) !== SHARED_SECRET) {
      return reply_({ ok: false, error: 'unauthorised' });
    }

    const handler = ACTIONS[body.action];
    if (!handler) return reply_({ ok: false, error: 'unknown action: ' + body.action });

    handler(body.payload || {});
    return reply_({ ok: true, queue_id: body.queue_id });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.stack || err) });
  }
}

// Optional GET for health-check (visit the /exec URL in a browser).
function doGet() {
  return reply_({ ok: true, hint: 'Paolas POS sheets backend' });
}

// ---- CORE HELPERS ----
function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SCHEMAS[name].columns);
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsert_(tabName, payload) {
  const schema = SCHEMAS[tabName];
  const sh = getSheet_(tabName);
  const keyVal = payload[schema.keyPath];
  if (keyVal === undefined || keyVal === null || keyVal === '') {
    throw new Error(tabName + ': missing key ' + schema.keyPath);
  }
  const row = schema.columns.map((c) => serialise_(payload[c]));
  const data = sh.getDataRange().getValues();
  const keyCol = schema.columns.indexOf(schema.keyPath);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]) === String(keyVal)) {
      sh.getRange(i + 1, 1, 1, schema.columns.length).setValues([row]);
      return;
    }
  }
  sh.appendRow(row);
}

function deleteRow_(tabName, keyCol, keyVal) {
  const sh = getSheet_(tabName);
  const schema = SCHEMAS[tabName];
  const data = sh.getDataRange().getValues();
  const colIdx = schema.columns.indexOf(keyCol);
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIdx]) === String(keyVal)) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

function append_(tabName, payload) {
  const schema = SCHEMAS[tabName];
  const sh = getSheet_(tabName);
  const row = schema.columns.map((c) => serialise_(payload[c]));
  sh.appendRow(row);
}

// Arrays/objects become JSON strings so they round-trip cleanly to the POS.
function serialise_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ---- ONE-TIME SETUP (run from the Apps Script editor) ----
function setupTabs() {
  Object.keys(SCHEMAS).forEach((name) => {
    const sh = getSheet_(name);
    const headerRow = sh.getRange(1, 1, 1, SCHEMAS[name].columns.length).getValues()[0];
    const needsHeaders = headerRow.every((h) => h === '');
    if (needsHeaders) {
      sh.getRange(1, 1, 1, SCHEMAS[name].columns.length).setValues([SCHEMAS[name].columns]);
      sh.setFrozenRows(1);
    }
  });
  Logger.log('All tabs ready: ' + Object.keys(SCHEMAS).join(', '));
}
