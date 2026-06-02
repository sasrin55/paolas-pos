// First-boot seed. After that, the IndexedDB local store is the source of
// truth (we don't re-seed). Test PINs are documented in the README — please
// change them before going live.

import { hashPin } from '../lib/pin.js';

export const SEED_MENU = [
  { item_id: 'M001', category: 'Starters', name: 'Bruschetta',          price_pkr: 850,  available: true, modifier_group_ids: [] },
  { item_id: 'M002', category: 'Starters', name: 'Caprese Salad',       price_pkr: 1100, available: true, modifier_group_ids: [] },
  { item_id: 'M003', category: 'Starters', name: 'Garlic Bread',        price_pkr: 600,  available: true, modifier_group_ids: ['G_BREAD'] },
  { item_id: 'M004', category: 'Pizza',    name: 'Margherita',          price_pkr: 1850, available: true, modifier_group_ids: ['G_SIZE', 'G_TOPPING'] },
  { item_id: 'M005', category: 'Pizza',    name: 'Pepperoni',           price_pkr: 2200, available: true, modifier_group_ids: ['G_SIZE', 'G_TOPPING'] },
  { item_id: 'M006', category: 'Pizza',    name: 'Quattro Formaggi',    price_pkr: 2400, available: true, modifier_group_ids: ['G_SIZE'] },
  { item_id: 'M007', category: 'Pasta',    name: 'Spaghetti Bolognese', price_pkr: 1950, available: true, modifier_group_ids: ['G_SPICE'] },
  { item_id: 'M008', category: 'Pasta',    name: 'Penne Arrabbiata',    price_pkr: 1700, available: true, modifier_group_ids: ['G_SPICE'] },
  { item_id: 'M009', category: 'Pasta',    name: 'Fettuccine Alfredo',  price_pkr: 1900, available: true, modifier_group_ids: [] },
  { item_id: 'M010', category: 'Mains',    name: 'Chicken Parmigiana',  price_pkr: 2600, available: true, modifier_group_ids: [] },
  { item_id: 'M011', category: 'Mains',    name: 'Beef Tenderloin',     price_pkr: 3800, available: true, modifier_group_ids: ['G_DONENESS'] },
  { item_id: 'M012', category: 'Desserts', name: 'Tiramisu',            price_pkr: 950,  available: true, modifier_group_ids: [] },
  { item_id: 'M013', category: 'Desserts', name: 'Panna Cotta',         price_pkr: 850,  available: true, modifier_group_ids: [] },
  { item_id: 'M014', category: 'Drinks',   name: 'Fresh Lime',          price_pkr: 350,  available: true, modifier_group_ids: ['G_TEMP'] },
  { item_id: 'M015', category: 'Drinks',   name: 'Cappuccino',          price_pkr: 550,  available: true, modifier_group_ids: ['G_TEMP'] },
];

export const SEED_MODIFIER_GROUPS = [
  { group_id: 'G_SIZE',     name: 'Size',         required: true,  multi: false },
  { group_id: 'G_TOPPING',  name: 'Extra topping', required: false, multi: true  },
  { group_id: 'G_SPICE',    name: 'Spice level',  required: true,  multi: false },
  { group_id: 'G_TEMP',     name: 'Temperature',  required: true,  multi: false },
  { group_id: 'G_DONENESS', name: 'Doneness',     required: true,  multi: false },
  { group_id: 'G_BREAD',    name: 'Extras',       required: false, multi: true  },
];

export const SEED_MODIFIERS = [
  { modifier_id: 'X_S',     group: 'G_SIZE',     name: 'Small',        price_delta_pkr: -300 },
  { modifier_id: 'X_M',     group: 'G_SIZE',     name: 'Medium',       price_delta_pkr: 0    },
  { modifier_id: 'X_L',     group: 'G_SIZE',     name: 'Large',        price_delta_pkr: 400  },
  { modifier_id: 'X_CHEESE',group: 'G_TOPPING',  name: 'Extra cheese', price_delta_pkr: 250  },
  { modifier_id: 'X_MUSH',  group: 'G_TOPPING',  name: 'Mushroom',     price_delta_pkr: 200  },
  { modifier_id: 'X_OLIVE', group: 'G_TOPPING',  name: 'Olives',       price_delta_pkr: 200  },
  { modifier_id: 'X_MILD',  group: 'G_SPICE',    name: 'Mild',         price_delta_pkr: 0    },
  { modifier_id: 'X_MED',   group: 'G_SPICE',    name: 'Medium',       price_delta_pkr: 0    },
  { modifier_id: 'X_HOT',   group: 'G_SPICE',    name: 'Hot',          price_delta_pkr: 0    },
  { modifier_id: 'X_HOT_T', group: 'G_TEMP',     name: 'Hot',          price_delta_pkr: 0    },
  { modifier_id: 'X_ICE_T', group: 'G_TEMP',     name: 'Iced',         price_delta_pkr: 50   },
  { modifier_id: 'X_RARE',  group: 'G_DONENESS', name: 'Rare',         price_delta_pkr: 0    },
  { modifier_id: 'X_MEDR',  group: 'G_DONENESS', name: 'Medium-rare',  price_delta_pkr: 0    },
  { modifier_id: 'X_WELL',  group: 'G_DONENESS', name: 'Well-done',    price_delta_pkr: 0    },
  { modifier_id: 'X_GARLIC',group: 'G_BREAD',    name: 'Extra garlic', price_delta_pkr: 100  },
];

export const SEED_TABLES = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return {
    table_id: `T${String(n).padStart(2, '0')}`,
    label: `Table ${n}`,
    capacity: n <= 8 ? 4 : 6,
    zone: 'Main',
    status: 'free',
    active_bill_id: null,
  };
});

// Test users. PINs documented in README — change before launch.
// Sara (manager) 9999 / Ali (waiter) 1111 / Bilal (waiter) 2222
const RAW_USERS = [
  { user_id: 'U_SARA',  name: 'Sara',  role: 'manager', pin: '9999' },
  { user_id: 'U_ALI',   name: 'Ali',   role: 'waiter',  pin: '1111' },
  { user_id: 'U_BILAL', name: 'Bilal', role: 'waiter',  pin: '2222' },
];

export async function buildSeedUsers() {
  return Promise.all(RAW_USERS.map(async (u) => {
    const { salt, pin_hash } = await hashPin(u.pin);
    return { user_id: u.user_id, name: u.name, role: u.role, salt, pin_hash };
  }));
}

export async function buildSeed() {
  return {
    menu: SEED_MENU,
    modifierGroups: SEED_MODIFIER_GROUPS,
    modifiers: SEED_MODIFIERS,
    tables: SEED_TABLES,
    users: await buildSeedUsers(),
  };
}
