import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { toggleItemAvailability } from '../data-layer/index.js';
import ManagerPinModal from './ManagerPinModal.jsx';

export default function MenuGrid({ onPick }) {
  const { menu, currentUser, refreshAll } = useApp();
  const categories = useMemo(() => [...new Set(menu.map((m) => m.category))], [menu]);
  const [cat, setCat] = useState(categories[0]);
  const [pendingToggle, setPendingToggle] = useState(null);

  // keep selected category in sync if categories load
  if (cat && !categories.includes(cat) && categories.length) setCat(categories[0]);

  const items = menu.filter((m) => m.category === cat);

  const isManager = currentUser?.role === 'manager';

  const onLongPress = (item) => {
    if (isManager) {
      // managers can flip immediately, still audit-logged inside the data-layer call.
      toggleItemAvailability(item.item_id, !item.available, currentUser.user_id).then(refreshAll);
    } else {
      setPendingToggle(item);
    }
  };

  return (
    <div className="flex flex-col h-full bg-paolas-bg">
      <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto border-b border-paolas-border">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`min-h-tap px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium ${cat === c ? 'bg-paolas-accent text-white' : 'bg-paolas-border text-gray-200'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((it) => (
            <MenuButton key={it.item_id} item={it} onPick={onPick} onLongPress={onLongPress} />
          ))}
          {items.length === 0 && (
            <div className="col-span-full text-sm text-gray-500 italic">No items in this category.</div>
          )}
        </div>
        <p className="mt-4 text-[11px] text-gray-500">
          Long-press an item to toggle 86 (sold out). Waiters require manager PIN.
        </p>
      </div>

      <ManagerPinModal
        open={!!pendingToggle}
        onClose={() => setPendingToggle(null)}
        action={pendingToggle?.available ? 'item_86d' : 'item_unsuspended'}
        detail={pendingToggle ? `${pendingToggle.name} → ${pendingToggle.available ? '86 (sold out)' : 'available'}` : ''}
        onApproved={async (mgr) => {
          if (!pendingToggle) return;
          await toggleItemAvailability(pendingToggle.item_id, !pendingToggle.available, mgr.user_id);
          await refreshAll();
          setPendingToggle(null);
        }}
      />
    </div>
  );
}

function MenuButton({ item, onPick, onLongPress }) {
  let timer = null;
  let longFired = false;

  const startPress = () => {
    longFired = false;
    timer = setTimeout(() => { longFired = true; onLongPress(item); }, 600);
  };
  const endPress = (fire) => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (fire && !longFired && item.available) onPick(item);
  };

  return (
    <button
      onMouseDown={startPress}
      onMouseUp={() => endPress(true)}
      onMouseLeave={() => endPress(false)}
      onTouchStart={startPress}
      onTouchEnd={(e) => { e.preventDefault(); endPress(true); }}
      disabled={!item.available}
      className={`min-h-tap rounded-xl border p-3 text-left active:scale-[0.98] ${
        item.available
          ? 'bg-paolas-panel border-paolas-border'
          : 'bg-paolas-panel border-paolas-border opacity-40'
      }`}
    >
      <div className="text-base font-medium leading-tight">{item.name}</div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm text-gray-300">{formatPKR(item.price_pkr)}</span>
        {!item.available && <span className="text-[10px] uppercase text-red-400">86</span>}
      </div>
    </button>
  );
}
