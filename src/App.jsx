import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext.jsx';
import Header from './components/Header.jsx';
import FloorView from './components/FloorView.jsx';
import OrderPanel from './components/OrderPanel.jsx';
import MenuGrid from './components/MenuGrid.jsx';
import ModifierPicker from './components/ModifierPicker.jsx';
import SplitBillSheet from './components/SplitBillSheet.jsx';
import PaymentSheet from './components/PaymentSheet.jsx';
import TransferMergeSheet from './components/TransferMergeSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import EODReport from './components/EODReport.jsx';
import SignIn from './components/SignIn.jsx';
import CustomerSheet from './components/CustomerSheet.jsx';
import MenuEditor from './components/MenuEditor.jsx';
import HouseAccountsSheet from './components/HouseAccountsSheet.jsx';
import NonTableStartSheet from './components/NonTableStartSheet.jsx';
import {
  saveBill, saveBillItem, deleteBillItem, updateTable, saveCustomer,
} from './data-layer/index.js';
import ManagerPinModal from './components/ManagerPinModal.jsx';
import BillHistorySheet from './components/BillHistorySheet.jsx';
import { newBillId, newLineId, todayISO, nowISO } from './lib/id.js';
import { lineTotal } from './lib/bill-math.js';
import { STATES, advanceOnItem } from './lib/lifecycle.js';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { ready, currentUser, tables, bills, config, refreshAll, rtl } = useApp();
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [view, setView] = useState('floor'); // floor | menu
  const [pickingItem, setPickingItem] = useState(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [tmSheet, setTmSheet] = useState({ open: false, mode: null, sourceTable: null });
  const [customerOpen, setCustomerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [houseAccountsOpen, setHouseAccountsOpen] = useState(false);
  const [replaceContext, setReplaceContext] = useState(null); // line being replaced
  const [pendingReplace, setPendingReplace] = useState(null); // { line, newItem }
  const [activeNonTableBillId, setActiveNonTableBillId] = useState(null); // for takeaway/delivery
  const [startSheet, setStartSheet] = useState({ open: false, mode: null });

  useEffect(() => {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [rtl]);

  if (!ready) {
    return <div className="h-full flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (!currentUser) return <SignIn />;

  const selectedTable = tables.find((t) => t.table_id === selectedTableId) || null;
  const activeBill = activeNonTableBillId
    ? bills.find((b) => b.bill_id === activeNonTableBillId)
    : (selectedTable?.active_bill_id ? bills.find((b) => b.bill_id === selectedTable.active_bill_id) : null);

  const ensureBill = async () => {
    if (!selectedTable) return null;
    if (activeBill) return activeBill;
    const b = {
      bill_id: newBillId(),
      outlet_id: config.outlet_id,
      date: todayISO(),
      time_opened: nowISO(),
      time_closed: '',
      table: selectedTable.table_id,
      table_label: selectedTable.label,
      pax: 0,
      service_mode: 'dine-in',
      server_id: currentUser.user_id,
      server_name: currentUser.name,
      discount_pct: 0,
      comp_amount: 0,
      tip_pkr: 0,
      status: STATES.NEW,
    };
    await saveBill(b);
    await updateTable({ ...selectedTable, status: 'occupied', active_bill_id: b.bill_id });
    await refreshAll();
    return b;
  };

  const onPickMenuItem = (item) => {
    // replace mode: stage the new item, then go through manager PIN
    if (replaceContext) {
      setPendingReplace({ line: replaceContext, newItem: item });
      return;
    }
    if (!item.modifier_group_ids?.length) {
      addLine(item, { qty: 1, modifiers: [], note: '' });
    } else {
      setPickingItem(item);
    }
  };

  const startNonTableOrder = (mode) => setStartSheet({ open: true, mode });

  const finishNonTableStart = async ({ phone, name, customer, address, scheduled_for }) => {
    const mode = startSheet.mode;
    // If a customer matched, use them. Otherwise create a stub so the order
    // gets a customer record from the start (Seated guest data depends on it).
    let cust = customer;
    if (!cust && phone) {
      cust = {
        customer_id: 'CUS-' + phone.replace(/\D/g, '').slice(-9),
        outlet_id: config.outlet_id,
        phone,
        name: name || '',
        first_visit: nowISO(),
        last_visit: nowISO(),
        visit_count: 0,
        total_spend_pkr: 0,
        tags: '',
        notes: '',
        loyalty_points: 0,
        house_account_balance: 0,
      };
      await saveCustomer(cust);
    }
    const labelBase = mode === 'takeaway' ? 'Takeaway' : 'Delivery';
    const b = {
      bill_id: newBillId(),
      outlet_id: config.outlet_id,
      date: todayISO(),
      time_opened: nowISO(),
      time_closed: '',
      table: '',
      table_label: cust?.name ? `${labelBase} · ${cust.name}` : labelBase,
      pax: 0,
      service_mode: mode,
      server_id: currentUser.user_id,
      server_name: currentUser.name,
      customer_id: cust?.customer_id || '',
      customer_phone: cust?.phone || phone || '',
      customer_name:  cust?.name  || name  || '',
      delivery_address: address || '',
      scheduled_for: scheduled_for || '',
      discount_pct: 0,
      comp_amount: 0,
      tip_pkr: 0,
      status: STATES.NEW,
    };
    await saveBill(b);
    setStartSheet({ open: false, mode: null });
    setSelectedTableId(null);
    setActiveNonTableBillId(b.bill_id);
    setView('menu');
    await refreshAll();
  };

  const addLine = async (menuItem, picked) => {
    const b = await ensureBill();
    if (!b) return;
    const line = {
      line_id: newLineId(),
      bill_id: b.bill_id,
      outlet_id: b.outlet_id,
      item_id: menuItem.item_id,
      item_name: menuItem.name,
      qty: picked.qty,
      unit_price: menuItem.price_pkr,
      modifiers: picked.modifiers,
      line_total: 0,
      note: picked.note,
      sent_to_kitchen: false,
      voided_by: '',
    };
    line.line_total = lineTotal(line);
    await saveBillItem(line);
    // advance new → running on first line
    if (b.status === STATES.NEW) {
      await saveBill({ ...b, status: advanceOnItem(b.status) });
    }
    await refreshAll();
  };

  return (
    <div className="h-full w-full flex flex-col bg-paolas-bg">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenEOD={() => setEodOpen(true)}
        onOpenMenuEditor={() => setMenuEditorOpen(true)}
        onOpenHouseAccounts={() => setHouseAccountsOpen(true)}
      />

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="px-4 pt-3 pb-1 flex gap-2 md:hidden">
            <ViewTab active={view === 'floor'} onClick={() => setView('floor')}>Floor</ViewTab>
            <ViewTab active={view === 'menu'} disabled={!selectedTable} onClick={() => setView('menu')}>Menu</ViewTab>
          </div>

          {/* Two-pane on desktop, swap on mobile */}
          <div className="flex-1 hidden md:flex">
            {view === 'menu' && selectedTable
              ? <MenuGrid onPick={onPickMenuItem} />
              : <FloorView
                  selectedTableId={selectedTableId}
                  onSelectTable={(id) => { setActiveNonTableBillId(null); setSelectedTableId(id); }}
                  onTransferRequest={(t) => setTmSheet({ open: true, mode: 'transfer', sourceTable: t })}
                  onMergeRequest={(t) => setTmSheet({ open: true, mode: 'merge', sourceTable: t })}
                  onStartTakeaway={() => startNonTableOrder('takeaway')}
                  onStartDelivery={() => startNonTableOrder('delivery')}
                  onOpenHistory={() => setHistoryOpen(true)}
                />}
          </div>
          <div className="flex-1 md:hidden">
            {view === 'menu' && selectedTable
              ? <MenuGrid onPick={onPickMenuItem} />
              : <FloorView
                  selectedTableId={selectedTableId}
                  onSelectTable={(id) => { setActiveNonTableBillId(null); setSelectedTableId(id); }}
                  onTransferRequest={(t) => setTmSheet({ open: true, mode: 'transfer', sourceTable: t })}
                  onMergeRequest={(t) => setTmSheet({ open: true, mode: 'merge', sourceTable: t })}
                  onStartTakeaway={() => startNonTableOrder('takeaway')}
                  onStartDelivery={() => startNonTableOrder('delivery')}
                  onOpenHistory={() => setHistoryOpen(true)}
                />}
          </div>
        </div>

        <OrderPanel
          selectedTableId={selectedTableId}
          activeBillId={activeNonTableBillId}
          onOpenMenu={() => setView('menu')}
          onSplit={() => setSplitOpen(true)}
          onPay={() => setPayOpen(true)}
          onAttachCustomer={() => setCustomerOpen(true)}
          onReplaceLine={(line) => { setReplaceContext(line); setView('menu'); }}
        />
      </main>

      <ModifierPicker
        open={!!pickingItem}
        item={pickingItem}
        onClose={() => setPickingItem(null)}
        onConfirm={(picked) => {
          addLine(pickingItem, picked);
          setPickingItem(null);
        }}
      />
      <SplitBillSheet open={splitOpen} onClose={() => setSplitOpen(false)} bill={activeBill} />
      <PaymentSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        bill={activeBill}
        onClosed={() => {
          setPayOpen(false);
          setView('floor');
          setSelectedTableId(null);
          setActiveNonTableBillId(null);
        }}
      />
      <TransferMergeSheet
        open={tmSheet.open}
        mode={tmSheet.mode}
        sourceTable={tmSheet.sourceTable}
        onClose={() => setTmSheet({ open: false, mode: null, sourceTable: null })}
      />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <EODReport open={eodOpen} onClose={() => setEodOpen(false)} />
      <CustomerSheet open={customerOpen} onClose={() => setCustomerOpen(false)} bill={activeBill} />
      <BillHistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <MenuEditor open={menuEditorOpen} onClose={() => setMenuEditorOpen(false)} />
      <HouseAccountsSheet open={houseAccountsOpen} onClose={() => setHouseAccountsOpen(false)} />
      <NonTableStartSheet
        open={startSheet.open}
        mode={startSheet.mode}
        onClose={() => setStartSheet({ open: false, mode: null })}
        onConfirm={finishNonTableStart}
      />

      {/* Replace flow: approve via manager PIN then swap the line */}
      <ManagerPinModal
        open={!!pendingReplace}
        onClose={() => { setPendingReplace(null); setReplaceContext(null); }}
        action="replace_item"
        bill_id={pendingReplace?.line?.bill_id || ''}
        detail={pendingReplace ? `${pendingReplace.line.item_name} → ${pendingReplace.newItem.name}` : ''}
        requireReason
        onApproved={async () => {
          if (!pendingReplace) return;
          await deleteBillItem(pendingReplace.line.line_id);
          await addLine(pendingReplace.newItem, { qty: pendingReplace.line.qty, modifiers: [], note: pendingReplace.line.note });
          setPendingReplace(null);
          setReplaceContext(null);
          setView('floor');
          await refreshAll();
        }}
      />
    </div>
  );
}

function ViewTab({ active, disabled, children, onClick }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`min-h-tap px-4 py-2 rounded-lg text-sm font-medium ${active ? 'bg-paolas-accent' : 'bg-paolas-border'} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
