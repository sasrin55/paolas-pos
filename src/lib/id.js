// Human-readable IDs so they're easier to read off a receipt or sheet.

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function rand(n = 3) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase();
}

export const newBillId    = () => `B-${ts()}-${rand()}`;
export const newLineId    = () => `L-${ts()}-${rand()}`;
export const newPaymentId = () => `P-${ts()}-${rand()}`;
export const newUserId    = () => `U-${rand(4)}`;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}
