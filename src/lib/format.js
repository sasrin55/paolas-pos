export function formatPKR(amount) {
  const n = Number(amount) || 0;
  return 'Rs ' + n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}
