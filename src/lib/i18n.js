// Tiny i18n scaffold. v1 ships English only — the scaffold exists so adding
// Urdu later is "drop a strings file in, flip a setting" rather than a
// rewrite. RTL handling lives in App.jsx via the dir attribute.
//
// Usage:
//   import { t, setLocale, RTL_LOCALES } from '../lib/i18n.js';
//   t('order.empty')

import en from './strings/en.json';
// import ur from './strings/ur.json'; // add when Urdu strings exist

const BUNDLES = { en /* , ur */ };
export const RTL_LOCALES = new Set(['ur', 'ar']);

let current = 'en';
let listeners = new Set();

export function setLocale(loc) {
  if (!BUNDLES[loc]) return;
  current = loc;
  listeners.forEach((cb) => cb(loc));
}

export function getLocale() { return current; }
export function isRTL()     { return RTL_LOCALES.has(current); }
export function onLocaleChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function t(key, vars = {}) {
  const bundle = BUNDLES[current] || BUNDLES.en;
  const raw = bundle[key] ?? BUNDLES.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}
