// Print helpers. We use a hidden iframe + window.print() so we never disrupt
// the POS view. KOT and receipt templates are styled for ~80mm thermal width.

import { formatPKR } from './format.js';

function openPrintWindow(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

const THERMAL_CSS = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, 'Menlo', 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 0; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .h1     { font-size: 16px; font-weight: 700; }
  .h2     { font-size: 14px; font-weight: 700; }
  .row    { display: flex; justify-content: space-between; gap: 6px; }
  .dashes { border-top: 1px dashed #000; margin: 6px 0; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; }
  .mods   { padding-left: 8px; color: #333; font-size: 11px; }
  .small  { font-size: 11px; }
`;

export function printKOT({ bill, items, restaurant }) {
  const lines = items.map((it) => `
    <tr>
      <td>${it.qty}× ${escapeHtml(it.item_name)}</td>
    </tr>
    ${it.modifiers?.length ? `<tr><td class="mods">${it.modifiers.map((m) => escapeHtml(m.name)).join(', ')}</td></tr>` : ''}
    ${it.note ? `<tr><td class="mods">note: ${escapeHtml(it.note)}</td></tr>` : ''}
  `).join('');

  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>KOT</title>
    <style>${THERMAL_CSS}</style></head><body>
      <div class="center h2">KITCHEN TICKET</div>
      <div class="center small">${escapeHtml(restaurant || 'Paolas')}</div>
      <div class="dashes"></div>
      <div class="row"><span>Table</span><span class="bold">${escapeHtml(bill.table_label || bill.table)}</span></div>
      <div class="row"><span>Bill</span><span>${escapeHtml(bill.bill_id)}</span></div>
      <div class="row"><span>Server</span><span>${escapeHtml(bill.server_name || '')}</span></div>
      <div class="row"><span>Time</span><span>${new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="row"><span>Mode</span><span>${escapeHtml(bill.service_mode || 'dine-in')}</span></div>
      <div class="dashes"></div>
      <table>${lines}</table>
    </body></html>
  `;
  openPrintWindow(html);
}

export function printReceipt({ bill, items, payments, totals, restaurant, config, fbr }) {
  const lines = items.map((it) => {
    const each = (it.unit_price + (it.modifiers || []).reduce((s, m) => s + m.price_delta_pkr, 0));
    const lineTotal = each * it.qty;
    return `
      <tr>
        <td>${it.qty}× ${escapeHtml(it.item_name)}</td>
        <td class="right">${formatPKR(lineTotal)}</td>
      </tr>
      ${it.modifiers?.length ? `<tr><td class="mods" colspan="2">${it.modifiers.map((m) => escapeHtml(m.name)).join(', ')}</td></tr>` : ''}
      ${it.note ? `<tr><td class="mods" colspan="2">note: ${escapeHtml(it.note)}</td></tr>` : ''}
    `;
  }).join('');

  const paymentRows = (payments || []).map((p) => `
    <div class="row"><span>${escapeHtml(p.tender_type)}</span><span>${formatPKR(p.amount_pkr)}</span></div>
  `).join('');

  const fbrBlock = fbr?.enabled ? `
    <div class="dashes"></div>
    <div class="center small">FBR/PRA Invoice</div>
    <div class="row"><span>Invoice #</span><span>${escapeHtml(fbr.invoice_number || '—')}</span></div>
    ${fbr.qr_data ? `<div class="center"><img alt="QR" style="height:80px" src="${qrDataUrl(fbr.qr_data)}"/></div>` : ''}
    <div class="center small">${escapeHtml(config?.fbr?.integration_live ? '' : '(slot — integration pending)')}</div>
  ` : '';

  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
    <style>${THERMAL_CSS}</style></head><body>
      <div class="center h1">${escapeHtml(restaurant || 'Paolas')}</div>
      ${config?.restaurant?.address ? `<div class="center small">${escapeHtml(config.restaurant.address)}</div>` : ''}
      ${config?.restaurant?.phone ? `<div class="center small">${escapeHtml(config.restaurant.phone)}</div>` : ''}
      ${config?.restaurant?.gst_number ? `<div class="center small">GST: ${escapeHtml(config.restaurant.gst_number)}</div>` : ''}
      <div class="dashes"></div>
      <div class="row"><span>${escapeHtml(bill.date)}</span><span>${new Date(bill.time_closed || Date.now()).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="row"><span>Table</span><span class="bold">${escapeHtml(bill.table_label || bill.table)}</span></div>
      <div class="row"><span>Bill</span><span>${escapeHtml(bill.bill_id)}</span></div>
      <div class="row"><span>Server</span><span>${escapeHtml(bill.server_name || '')}</span></div>
      <div class="row"><span>Mode</span><span>${escapeHtml(bill.service_mode || 'dine-in')}</span></div>
      ${bill.pax ? `<div class="row"><span>Pax</span><span>${bill.pax}</span></div>` : ''}
      <div class="dashes"></div>
      <table>${lines}</table>
      <div class="dashes"></div>
      <div class="row"><span>Subtotal</span><span>${formatPKR(totals.subtotal)}</span></div>
      ${totals.discount ? `<div class="row"><span>Discount</span><span>-${formatPKR(totals.discount)}</span></div>` : ''}
      ${totals.comp ? `<div class="row"><span>Comp</span><span>-${formatPKR(totals.comp)}</span></div>` : ''}
      ${totals.service ? `<div class="row"><span>Service</span><span>${formatPKR(totals.service)}</span></div>` : ''}
      ${totals.tax ? `<div class="row"><span>Tax</span><span>${formatPKR(totals.tax)}</span></div>` : ''}
      <div class="row bold"><span>TOTAL</span><span>${formatPKR(totals.total)}</span></div>
      <div class="dashes"></div>
      ${paymentRows}
      ${fbrBlock}
      <div class="dashes"></div>
      <div class="center small">Thank you · come again</div>
    </body></html>
  `;
  openPrintWindow(html);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Tiny QR via public quickchart endpoint. Only fires if integration_live is true
// — until then the slot is shown without a QR.
function qrDataUrl(data) {
  return `https://quickchart.io/qr?text=${encodeURIComponent(data)}&size=160`;
}
