// Demo data — populates the local store with a realistic-looking slice of
// activity so the floor, EOD, House accounts, customer history, and bill
// history all have something to show on a fresh install.
//
// Idempotent: gated by the `demo_seeded` meta key. Triggered from
// AppContext after seedIfEmpty when config.demo_data is true.

import { DEFAULT_OUTLET_ID } from '../lib/config.js';

const O = DEFAULT_OUTLET_ID;

// ---- time helpers ----
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayDate() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function isoOn(dateStr, hour, minute = 0) {
  const d = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  return d.toISOString();
}

// ---- customers (varied profiles) ----
export const DEMO_CUSTOMERS = [
  {
    customer_id: 'CUS-DEMO-AZAM',
    outlet_id: O,
    phone: '0300 1234567',
    name: 'Azam Sheikh',
    first_visit: '2025-11-12T19:30:00.000Z',
    last_visit: '2026-05-28T20:10:00.000Z',
    visit_count: 12,
    total_spend_pkr: 84_600,
    tags: 'VIP, regular',
    notes: 'NUT ALLERGY — please flag with kitchen. Usually orders Margherita + Fresh Lime.',
    loyalty_points: 846,
    house_account_balance: 0,
  },
  {
    customer_id: 'CUS-DEMO-HASHMI',
    outlet_id: O,
    phone: '0321 9876543',
    name: 'Mrs. Hashmi',
    first_visit: '2025-08-04T13:20:00.000Z',
    last_visit: '2026-05-30T14:45:00.000Z',
    visit_count: 7,
    total_spend_pkr: 38_200,
    tags: 'regular',
    notes: 'Prefers window seat.',
    loyalty_points: 382,
    house_account_balance: 0,
  },
  {
    customer_id: 'CUS-DEMO-MALIK',
    outlet_id: O,
    phone: '0345 4567890',
    name: 'Khalid Malik',
    first_visit: '2025-12-01T20:00:00.000Z',
    last_visit: '2026-05-25T21:30:00.000Z',
    visit_count: 9,
    total_spend_pkr: 71_400,
    tags: 'house-account',
    notes: 'Settles monthly. Cofounder of nearby agency.',
    loyalty_points: 214,
    house_account_balance: 12_400,
  },
  {
    customer_id: 'CUS-DEMO-NEW',
    outlet_id: O,
    phone: '0333 1112223',
    name: 'Sara Ahmed',
    first_visit: '2026-05-31T19:00:00.000Z',
    last_visit: '2026-05-31T19:00:00.000Z',
    visit_count: 1,
    total_spend_pkr: 3_800,
    tags: 'first-time',
    notes: '',
    loyalty_points: 38,
    house_account_balance: 0,
  },
  {
    customer_id: 'CUS-DEMO-RIAZ',
    outlet_id: O,
    phone: '0312 7654321',
    name: 'Riaz Family',
    first_visit: '2025-06-10T19:00:00.000Z',
    last_visit: '2026-05-29T20:30:00.000Z',
    visit_count: 24,
    total_spend_pkr: 218_000,
    tags: 'VIP, family',
    notes: 'Often books for 6. Kid menu requests common.',
    loyalty_points: 2_180,
    house_account_balance: 3_600,
  },
];

// ---- closed bills ----
// Eight closed bills: 5 yesterday, 3 today. Mix of tenders, tips, discounts,
// dine-in/takeaway/delivery, and one with loyalty redemption.

let _idSeq = 1;
const id = (prefix) => `${prefix}-DEMO-${String(_idSeq++).padStart(4, '0')}`;

function makeBill({ date, time_opened, time_closed, table, table_label, pax, service_mode, customer, items, payments, discount = 0, comp = 0, tip = 0, loyalty_points = 0 }) {
  const bill_id = id('B');
  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const taxable  = Math.max(0, subtotal - discount - comp - loyalty_points);
  const tax = 0;       // demo: tax disabled by default; flip in Settings + recompute
  const service = 0;
  const total = taxable + tax + service + tip;
  return {
    bill: {
      bill_id,
      outlet_id: O,
      date,
      time_opened: isoOn(date, ...time_opened),
      time_closed: isoOn(date, ...time_closed),
      table,
      table_label,
      pax,
      service_mode,
      server_id: 'U_ALI',
      server_name: 'Ali',
      customer_id: customer?.customer_id || '',
      customer_phone: customer?.phone || '',
      customer_name:  customer?.name  || '',
      discount_pct: 0,
      discount,
      comp,
      comp_amount: comp,
      loyalty_redeemed_pkr: loyalty_points,
      loyalty_redeemed_points: loyalty_points,
      service_charge: service,
      tax,
      tip_pkr: tip,
      subtotal,
      total,
      status: 'settled',
      fbr_invoice_number: `POS-${bill_id}`,
    },
    items: items.map((it, i) => ({
      ...it,
      line_id: id('L'),
      bill_id,
      outlet_id: O,
      modifiers: it.modifiers || [],
      note: it.note || '',
      sent_to_kitchen: true,
      voided_by: '',
    })),
    payments: payments.map((p) => ({
      payment_id: id('P'),
      bill_id,
      outlet_id: O,
      tender_type: p.tender,
      amount_pkr: p.amount,
      time: isoOn(date, ...time_closed),
      is_refund: false,
    })),
  };
}

export function buildDemoBills() {
  const today = todayDate();
  const yesterday = yesterdayDate();
  const built = [];

  // yesterday — lunch dine-in
  built.push(makeBill({
    date: yesterday,
    time_opened: [13, 5], time_closed: [13, 55],
    table: 'T03', table_label: 'Table 3', pax: 2, service_mode: 'dine-in',
    customer: DEMO_CUSTOMERS[1], // Mrs. Hashmi
    items: [
      { item_id: 'M002', item_name: 'Caprese Salad',    qty: 1, unit_price: 1100, line_total: 1100 },
      { item_id: 'M007', item_name: 'Spaghetti Bolognese', qty: 1, unit_price: 1950, line_total: 1950, modifiers: [{ modifier_id: 'X_MED', name: 'Medium', price_delta_pkr: 0 }] },
      { item_id: 'M015', item_name: 'Cappuccino', qty: 2, unit_price: 550, line_total: 1100 },
    ],
    payments: [{ tender: 'card', amount: 4150 }],
    tip: 200,
  }));

  // yesterday — Riaz family dinner, big dine-in
  built.push(makeBill({
    date: yesterday,
    time_opened: [20, 0], time_closed: [21, 10],
    table: 'T09', table_label: 'Table 9', pax: 6, service_mode: 'dine-in',
    customer: DEMO_CUSTOMERS[4], // Riaz Family
    items: [
      { item_id: 'M004', item_name: 'Margherita', qty: 2, unit_price: 1850, line_total: 3700, modifiers: [{ modifier_id: 'X_L', name: 'Large', price_delta_pkr: 400 }] },
      { item_id: 'M005', item_name: 'Pepperoni',  qty: 1, unit_price: 2200, line_total: 2200 },
      { item_id: 'M010', item_name: 'Chicken Parmigiana', qty: 2, unit_price: 2600, line_total: 5200 },
      { item_id: 'M012', item_name: 'Tiramisu', qty: 3, unit_price: 950, line_total: 2850 },
      { item_id: 'M014', item_name: 'Fresh Lime', qty: 4, unit_price: 350, line_total: 1400 },
    ],
    payments: [{ tender: 'cash', amount: 10000 }, { tender: 'easypaisa', amount: 5350 }],
    tip: 1000,
    discount: 800,
  }));

  // yesterday — Khalid Malik takeaway settled on house-account
  built.push(makeBill({
    date: yesterday,
    time_opened: [19, 30], time_closed: [19, 45],
    table: '', table_label: 'Takeaway · Khalid Malik', pax: 0, service_mode: 'takeaway',
    customer: DEMO_CUSTOMERS[2], // Khalid Malik
    items: [
      { item_id: 'M005', item_name: 'Pepperoni', qty: 1, unit_price: 2200, line_total: 2200 },
      { item_id: 'M008', item_name: 'Penne Arrabbiata', qty: 1, unit_price: 1700, line_total: 1700 },
    ],
    payments: [{ tender: 'house-account', amount: 3900 }],
  }));

  // yesterday — Mr Azam dine-in with loyalty redeem
  built.push(makeBill({
    date: yesterday,
    time_opened: [20, 0], time_closed: [21, 0],
    table: 'T05', table_label: 'Table 5', pax: 2, service_mode: 'dine-in',
    customer: DEMO_CUSTOMERS[0], // Azam
    items: [
      { item_id: 'M004', item_name: 'Margherita', qty: 1, unit_price: 1850, line_total: 1850 },
      { item_id: 'M014', item_name: 'Fresh Lime', qty: 2, unit_price: 350, line_total: 700 },
    ],
    payments: [{ tender: 'card', amount: 2350 }],
    loyalty_points: 200,
    tip: 150,
  }));

  // yesterday — delivery, JazzCash
  built.push(makeBill({
    date: yesterday,
    time_opened: [22, 15], time_closed: [22, 25],
    table: '', table_label: 'Delivery · Sara Ahmed', pax: 0, service_mode: 'delivery',
    customer: DEMO_CUSTOMERS[3], // Sara
    items: [
      { item_id: 'M006', item_name: 'Quattro Formaggi', qty: 1, unit_price: 2400, line_total: 2400 },
      { item_id: 'M013', item_name: 'Panna Cotta', qty: 1, unit_price: 850, line_total: 850 },
    ],
    payments: [{ tender: 'jazzcash', amount: 3250 }],
  }));

  // today — lunch dine-in
  built.push(makeBill({
    date: today,
    time_opened: [13, 0], time_closed: [13, 50],
    table: 'T02', table_label: 'Table 2', pax: 2, service_mode: 'dine-in',
    customer: DEMO_CUSTOMERS[1], // Mrs. Hashmi
    items: [
      { item_id: 'M009', item_name: 'Fettuccine Alfredo', qty: 1, unit_price: 1900, line_total: 1900 },
      { item_id: 'M002', item_name: 'Caprese Salad', qty: 1, unit_price: 1100, line_total: 1100 },
      { item_id: 'M015', item_name: 'Cappuccino', qty: 2, unit_price: 550, line_total: 1100 },
    ],
    payments: [{ tender: 'card', amount: 4100 }],
  }));

  // today — takeaway, cash
  built.push(makeBill({
    date: today,
    time_opened: [14, 30], time_closed: [14, 40],
    table: '', table_label: 'Takeaway', pax: 0, service_mode: 'takeaway',
    customer: null,
    items: [
      { item_id: 'M004', item_name: 'Margherita', qty: 1, unit_price: 1850, line_total: 1850 },
      { item_id: 'M014', item_name: 'Fresh Lime', qty: 1, unit_price: 350, line_total: 350 },
    ],
    payments: [{ tender: 'cash', amount: 2200 }],
  }));

  // today — Riaz family dine-in (still using house-account for a portion)
  built.push(makeBill({
    date: today,
    time_opened: [19, 0], time_closed: [20, 30],
    table: 'T07', table_label: 'Table 7', pax: 5, service_mode: 'dine-in',
    customer: DEMO_CUSTOMERS[4], // Riaz Family
    items: [
      { item_id: 'M011', item_name: 'Beef Tenderloin', qty: 2, unit_price: 3800, line_total: 7600, modifiers: [{ modifier_id: 'X_MEDR', name: 'Medium-rare', price_delta_pkr: 0 }] },
      { item_id: 'M005', item_name: 'Pepperoni', qty: 1, unit_price: 2200, line_total: 2200 },
      { item_id: 'M012', item_name: 'Tiramisu', qty: 2, unit_price: 950, line_total: 1900 },
      { item_id: 'M014', item_name: 'Fresh Lime', qty: 3, unit_price: 350, line_total: 1050 },
    ],
    payments: [
      { tender: 'card', amount: 10000 },
      { tender: 'house-account', amount: 2750 },
    ],
    tip: 800,
  }));

  return built;
}

// ---- one open bill on T04 (so the floor isn't all-free on first load) ----
export function buildOpenBill() {
  const today = todayDate();
  const bill_id = id('B');
  const bill = {
    bill_id,
    outlet_id: O,
    date: today,
    time_opened: isoOn(today, new Date().getHours(), Math.max(0, new Date().getMinutes() - 8)),
    time_closed: '',
    table: 'T04',
    table_label: 'Table 4',
    pax: 3,
    service_mode: 'dine-in',
    server_id: 'U_ALI',
    server_name: 'Ali',
    customer_id: '',
    customer_phone: '',
    customer_name: '',
    discount_pct: 0,
    comp_amount: 0,
    tip_pkr: 0,
    status: 'running',
  };
  const items = [
    {
      line_id: id('L'), bill_id, outlet_id: O,
      item_id: 'M004', item_name: 'Margherita',
      qty: 1, unit_price: 1850, line_total: 1850,
      modifiers: [{ modifier_id: 'X_M', name: 'Medium', price_delta_pkr: 0 }],
      note: '', sent_to_kitchen: true, voided_by: '',
    },
    {
      line_id: id('L'), bill_id, outlet_id: O,
      item_id: 'M007', item_name: 'Spaghetti Bolognese',
      qty: 1, unit_price: 1950, line_total: 1950,
      modifiers: [{ modifier_id: 'X_MED', name: 'Medium', price_delta_pkr: 0 }],
      note: 'extra parmesan please',
      sent_to_kitchen: true, voided_by: '',
    },
    {
      line_id: id('L'), bill_id, outlet_id: O,
      item_id: 'M014', item_name: 'Fresh Lime',
      qty: 3, unit_price: 350, line_total: 1050,
      modifiers: [], note: '',
      sent_to_kitchen: false, // staff hasn't fired the new drink yet
      voided_by: '',
    },
  ];
  return { bill, items };
}

// ---- a couple of audit log entries (so the gate story shows up) ----
export function buildDemoAudit() {
  const yesterday = yesterdayDate();
  return [
    {
      time: isoOn(yesterday, 21, 5),
      user_id: 'U_SARA',
      action: 'apply_discount',
      bill_id: 'B-DEMO-0002',
      reason: 'regular',
      detail: '10% on Table 9 (Riaz Family)',
    },
    {
      time: isoOn(yesterday, 19, 50),
      user_id: 'U_SARA',
      action: 'void_item',
      bill_id: '',
      reason: 'kitchen unable to make',
      detail: '1× Quattro Formaggi (sold-out cheese)',
    },
    {
      time: isoOn(yesterday, 14, 20),
      user_id: 'U_SARA',
      action: 'item_86d',
      bill_id: '',
      reason: 'sold out',
      detail: 'Fettuccine Alfredo',
    },
  ];
}

// ---- entry: returns everything packaged for ls.putMany ----
export function buildDemo() {
  const bills = buildDemoBills();
  const open = buildOpenBill();
  return {
    customers: DEMO_CUSTOMERS,
    bills:     [...bills.map((b) => b.bill), open.bill],
    billItems: [...bills.flatMap((b) => b.items), ...open.items],
    payments:  bills.flatMap((b) => b.payments),
    auditLog:  buildDemoAudit(),
    openTablePatch: {
      table_id: open.bill.table,
      active_bill_id: open.bill.bill_id,
      status: 'occupied',
    },
  };
}
