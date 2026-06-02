// Configurable bill-math + integration settings. Persisted in IndexedDB
// `meta` store under key 'config'. Default below is the empty-state shape.

export const DEFAULT_CONFIG = {
  restaurant: {
    name: 'Paolas',
    address: '',
    phone: '',
    gst_number: '',
  },
  tax: {
    enabled: false,
    cash_rate_pct:   null,
    card_rate_pct:   null,
    wallet_rate_pct: null,
  },
  service_charge: {
    enabled: false,
    rate_pct: null,
  },
  currency: 'PKR',
  // i18n: 'en' v1. Scaffolded to add 'ur' later via src/lib/strings/ur.json.
  locale: 'en',
  // Real-time peer sync (Phase 12). Run `npm run sync` on the cashier till,
  // then paste ws://<till-ip>:3001 here on the handhelds.
  sync_url: '',
  loyalty: {
    enabled: true,
    points_per_pkr: 0.01,  // 1 point per Rs 100
  },
  sheets: {
    endpoint: '',
    shared_secret: '',
  },
  fbr: {
    enabled: true,
    integration_live: false,
    endpoint: '',
    pos_id: '',
    fallback_invoice_prefix: 'POS',
  },
};

export const TENDER_TYPES = ['cash', 'card', 'easypaisa', 'jazzcash', 'raast'];
export const TENDER_LABEL = {
  cash:      'Cash',
  card:      'Card',
  easypaisa: 'easypaisa',
  jazzcash:  'JazzCash',
  raast:     'Raast',
};

export const SERVICE_MODES = ['dine-in', 'takeaway', 'delivery'];

export function mergeConfig(saved) {
  if (!saved) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    restaurant:     { ...DEFAULT_CONFIG.restaurant,     ...(saved.restaurant     || {}) },
    tax:            { ...DEFAULT_CONFIG.tax,            ...(saved.tax            || {}) },
    service_charge: { ...DEFAULT_CONFIG.service_charge, ...(saved.service_charge || {}) },
    loyalty:        { ...DEFAULT_CONFIG.loyalty,        ...(saved.loyalty        || {}) },
    sheets:         { ...DEFAULT_CONFIG.sheets,         ...(saved.sheets         || {}) },
    fbr:            { ...DEFAULT_CONFIG.fbr,            ...(saved.fbr            || {}) },
  };
}
