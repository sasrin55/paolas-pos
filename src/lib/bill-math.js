// Bill math kept pure and dependency-free so it's trivially testable and
// callable from both the active-order panel and EOD reconciliation.
//
// Tax is tender-aware: we apply the rate for the actual payment tender
// (cash vs card vs wallet). When a bill uses split tender, tax is computed
// per-tender weighted by amount. This is the safest interpretation of PRA
// rules until Raahim confirms otherwise — flag if PRA wants something else.

import { TENDER_TAX_KEY } from './config.js';

export function lineTotal(item) {
  const mods = (item.modifiers || []).reduce((s, m) => s + (m.price_delta_pkr || 0), 0);
  return (item.unit_price + mods) * item.qty;
}

export function computeBill(items, opts = {}) {
  const {
    discount_pct = 0,
    comp_amount  = 0,
    service_charge,        // { enabled, rate_pct }
    tax,                   // { enabled, cash_rate_pct, card_rate_pct, wallet_rate_pct }
    tender = 'cash',       // dominant tender, used when no payment breakdown given
    payments = null,       // optional [{ tender_type, amount_pkr }] for tender-weighted tax
  } = opts;

  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const discount = Math.round(subtotal * (discount_pct / 100));
  const comp     = Math.max(0, comp_amount);
  const taxable  = Math.max(0, subtotal - discount - comp);

  const service = service_charge?.enabled
    ? Math.round(taxable * ((service_charge.rate_pct || 0) / 100))
    : 0;

  const preTax = taxable + service;

  let taxAmount = 0;
  if (tax?.enabled) {
    if (payments && payments.length) {
      const totalPaid = payments.reduce((s, p) => s + p.amount_pkr, 0) || 1;
      for (const p of payments) {
        const rateKey = TENDER_TAX_KEY[p.tender_type] || 'card_rate_pct';
        const rate = tax[rateKey] || 0;
        const share = (p.amount_pkr / totalPaid) * preTax;
        taxAmount += share * (rate / 100);
      }
      taxAmount = Math.round(taxAmount);
    } else {
      const rate = tax[TENDER_TAX_KEY[tender] || 'card_rate_pct'] || 0;
      taxAmount = Math.round(preTax * (rate / 100));
    }
  }

  const total = preTax + taxAmount;
  return { subtotal, discount, comp, service, tax: taxAmount, total };
}
