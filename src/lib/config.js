// Configurable bill-math + integration settings. Persisted in IndexedDB
// `meta` store under key 'config'. Default below is the empty-state shape.

// Multi-outlet seed. Paolas is a single outlet for v1 — outlet_id is on every
// row that needs it so adding outlets later is config, not a migration.
export const DEFAULT_OUTLET_ID = 'PAOLAS';

export const DEFAULT_CONFIG = {
  outlet_id: DEFAULT_OUTLET_ID,
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
  // PIN bypass for exploration/dev. When true: auto-signs-in as the first
  // manager and ManagerPinModal auto-approves every gate (still audit-logged
  // with reason "(pins disabled)"). Flip OFF before going live.
  auth_disabled: true,
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

export const TENDER_TYPES = [
  'cash', 'card', 'easypaisa', 'jazzcash', 'raast', 'online-transfer', 'house-account',
];
export const TENDER_LABEL = {
  'cash':            'Cash',
  'card':            'Card',
  'easypaisa':       'easypaisa',
  'jazzcash':        'JazzCash',
  'raast':           'Raast',
  'online-transfer': 'Online transfer',
  'house-account':   'House account',
};
// Which tax rate slot applies to each tender. House-account defers payment,
// so taxed at the digital rate by default — revisit when balance is settled.
export const TENDER_TAX_KEY = {
  'cash':            'cash_rate_pct',
  'card':            'card_rate_pct',
  'easypaisa':       'wallet_rate_pct',
  'jazzcash':        'wallet_rate_pct',
  'raast':           'wallet_rate_pct',
  'online-transfer': 'wallet_rate_pct',
  'house-account':   'card_rate_pct',
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
