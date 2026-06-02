import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as dl from '../data-layer/index.js';
import { DEFAULT_CONFIG, mergeConfig } from '../lib/config.js';
import { buildSeed } from '../data/seed.js';
import { verifyPin } from '../lib/pin.js';

const Ctx = createContext(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be inside <AppProvider>');
  return v;
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // collections
  const [menu, setMenu] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [tables, setTables] = useState([]);
  const [users, setUsers] = useState([]);
  const [bills, setBills] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  // sync state
  const [sync, setSync] = useState({ online: navigator.onLine, queued: 0 });

  // signed-in user
  const [currentUser, setCurrentUser] = useState(null);

  const refreshAll = useCallback(async () => {
    const [m, mg, mods, t, u, b, bi, p, a] = await Promise.all([
      dl.listMenu(), dl.listModifierGroups(), dl.listModifiers(),
      dl.listTables(), dl.listUsers(),
      dl.listBills(), dl.listBillItems(), dl.listPayments(), dl.listAuditLog(),
    ]);
    setMenu(m); setModifierGroups(mg); setModifiers(mods);
    setTables(t); setUsers(u);
    setBills(b); setBillItems(bi); setPayments(p); setAuditLog(a);
  }, []);

  // boot
  useEffect(() => {
    (async () => {
      const seed = await buildSeed();
      await dl.seedIfEmpty(seed);
      const saved = await dl.getMeta('config');
      const cfg = mergeConfig(saved?.value);
      setConfig(cfg);
      await refreshAll();
      dl.startDrainer(() => cfg);
      const off = dl.onQueueChange((s) => setSync(s));
      setReady(true);
      return () => off();
    })();
  }, [refreshAll]);

  const saveConfig = useCallback(async (next) => {
    setConfig(next);
    await dl.setMeta('config', next);
  }, []);

  const signIn = useCallback(async (user_id, pin) => {
    const u = users.find((x) => x.user_id === user_id);
    if (!u) return false;
    const ok = await verifyPin(pin, u.salt, u.pin_hash);
    if (ok) setCurrentUser(u);
    return ok;
  }, [users]);

  const signOut = useCallback(() => setCurrentUser(null), []);

  // verify a manager PIN for a gated action. Returns the manager user or null.
  const verifyManagerPin = useCallback(async (pin) => {
    for (const u of users) {
      if (u.role !== 'manager') continue;
      if (await verifyPin(pin, u.salt, u.pin_hash)) return u;
    }
    return null;
  }, [users]);

  const value = {
    ready, config, saveConfig,
    menu, modifierGroups, modifiers, tables, users, bills, billItems, payments, auditLog,
    refreshAll,
    sync,
    currentUser, signIn, signOut, verifyManagerPin,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
