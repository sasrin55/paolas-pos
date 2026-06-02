import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as dl from '../data-layer/index.js';
import { DEFAULT_CONFIG, mergeConfig } from '../lib/config.js';
import { buildSeed } from '../data/seed.js';
import { verifyPin } from '../lib/pin.js';
import { setLocale, getLocale, isRTL, onLocaleChange } from '../lib/i18n.js';

const Ctx = createContext(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be inside <AppProvider>');
  return v;
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const [menu, setMenu] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [tables, setTables] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bills, setBills] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  const [sync, setSync] = useState({ online: navigator.onLine, queued: 0 });
  const [realtime, setRealtime] = useState({ connected: false, url: '' });
  const [locale, setLocaleState] = useState(getLocale());

  const [currentUser, setCurrentUser] = useState(null);

  const refreshAll = useCallback(async () => {
    const [m, mg, mods, t, u, cust, b, bi, p, a] = await Promise.all([
      dl.listMenu(), dl.listModifierGroups(), dl.listModifiers(),
      dl.listTables(), dl.listUsers(), dl.listCustomers(),
      dl.listBills(), dl.listBillItems(), dl.listPayments(), dl.listAuditLog(),
    ]);
    setMenu(m); setModifierGroups(mg); setModifiers(mods);
    setTables(t); setUsers(u); setCustomers(cust);
    setBills(b); setBillItems(bi); setPayments(p); setAuditLog(a);
  }, []);

  useEffect(() => {
    (async () => {
      const seed = await buildSeed();
      await dl.seedIfEmpty(seed);
      const saved = await dl.getMeta('config');
      const cfg = mergeConfig(saved?.value);
      setConfig(cfg);
      if (cfg.locale) { setLocale(cfg.locale); setLocaleState(cfg.locale); }
      await refreshAll();
      dl.startDrainer(() => cfg);
      const offSync = dl.onQueueChange((s) => setSync(s));

      // realtime peer sync
      if (cfg.sync_url) {
        dl.startRealtime(cfg.sync_url);
      }
      const offRT = dl.onRealtimeMessage(async (msg) => {
        await dl.applyRemote(msg.store, msg.payload, msg.op);
        refreshAll();
      });
      const offRTState = dl.onRealtimeState((s) => setRealtime(s));

      const offLocale = onLocaleChange((l) => setLocaleState(l));
      setReady(true);
      return () => { offSync(); offRT(); offRTState(); offLocale(); };
    })();
  }, [refreshAll]);

  const saveConfig = useCallback(async (next) => {
    setConfig(next);
    await dl.setMeta('config', next);
    if (next.sync_url) dl.startRealtime(next.sync_url);
    if (next.locale && next.locale !== getLocale()) {
      setLocale(next.locale);
      setLocaleState(next.locale);
    }
  }, []);

  const signIn = useCallback(async (user_id, pin) => {
    const u = users.find((x) => x.user_id === user_id);
    if (!u) return false;
    const ok = await verifyPin(pin, u.salt, u.pin_hash);
    if (ok) setCurrentUser(u);
    return ok;
  }, [users]);

  const signOut = useCallback(() => setCurrentUser(null), []);

  const verifyManagerPin = useCallback(async (pin) => {
    for (const u of users) {
      if (u.role !== 'manager') continue;
      if (await verifyPin(pin, u.salt, u.pin_hash)) return u;
    }
    return null;
  }, [users]);

  const value = {
    ready, config, saveConfig,
    menu, modifierGroups, modifiers, tables, users, customers,
    bills, billItems, payments, auditLog,
    refreshAll,
    sync, realtime, locale, rtl: isRTL(),
    currentUser, signIn, signOut, verifyManagerPin,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
