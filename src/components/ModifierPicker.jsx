import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';

export default function ModifierPicker({ item, open, onClose, onConfirm }) {
  const { modifierGroups, modifiers } = useApp();

  const groups = useMemo(() => {
    if (!item) return [];
    return (item.modifier_group_ids || []).map((gid) => {
      const group = modifierGroups.find((g) => g.group_id === gid);
      const choices = modifiers.filter((m) => m.group === gid);
      return { group, choices };
    }).filter((g) => g.group);
  }, [item, modifierGroups, modifiers]);

  const [selection, setSelection] = useState({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  // reset on item change
  const itemKey = item?.item_id || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemoOnce(itemKey, () => {
    setSelection({});
    setQty(1);
    setNote('');
  });

  const toggle = (group, modId) => {
    setSelection((prev) => {
      const cur = prev[group.group_id] || [];
      if (group.multi) {
        return { ...prev, [group.group_id]: cur.includes(modId) ? cur.filter((x) => x !== modId) : [...cur, modId] };
      }
      return { ...prev, [group.group_id]: [modId] };
    });
  };

  const flatMods = Object.values(selection).flat().map((id) => modifiers.find((m) => m.modifier_id === id)).filter(Boolean);
  const unitPrice = (item?.price_pkr || 0) + flatMods.reduce((s, m) => s + m.price_delta_pkr, 0);
  const total = unitPrice * qty;

  const missing = groups.filter((g) => g.group.required && !(selection[g.group.group_id]?.length));
  const canConfirm = missing.length === 0 && qty > 0;

  const confirm = () => {
    onConfirm({
      qty,
      note,
      modifiers: flatMods.map((m) => ({ modifier_id: m.modifier_id, name: m.name, price_delta_pkr: m.price_delta_pkr })),
    });
  };

  if (!item) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.name}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-300">
            Unit {formatPKR(unitPrice)} · <span className="text-white font-semibold">{formatPKR(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
            <button
              onClick={confirm}
              disabled={!canConfirm}
              className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
            >
              Add to order
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        {groups.length === 0 && (
          <p className="text-sm text-gray-400">No modifiers for this item. Set quantity and an optional note.</p>
        )}
        {groups.map(({ group, choices }) => (
          <div key={group.group_id}>
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="font-medium">
                {group.name}
                {group.required && <span className="text-red-400 ml-1">*</span>}
              </h4>
              <span className="text-xs text-gray-400">{group.multi ? 'pick any' : 'pick one'}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {choices.map((c) => {
                const picked = (selection[group.group_id] || []).includes(c.modifier_id);
                return (
                  <button
                    key={c.modifier_id}
                    onClick={() => toggle(group, c.modifier_id)}
                    className={`min-h-tap rounded-xl px-3 py-2 border text-left text-sm ${picked ? 'bg-paolas-accent border-paolas-accent' : 'bg-paolas-border border-paolas-border'}`}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] opacity-80">
                      {c.price_delta_pkr === 0 ? 'no charge' : (c.price_delta_pkr > 0 ? '+' : '') + formatPKR(c.price_delta_pkr)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <h4 className="font-medium mb-2">Quantity</h4>
          <div className="flex items-center gap-3">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="min-h-tap min-w-tap rounded-lg bg-paolas-border text-xl">−</button>
            <span className="text-2xl font-semibold w-10 text-center">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="min-h-tap min-w-tap rounded-lg bg-paolas-border text-xl">+</button>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2">Note (kitchen)</h4>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. no onions"
            className="w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border text-sm"
          />
        </div>
      </div>
    </Modal>
  );
}

// tiny helper to reset state when a key changes, without breaking eslint hook rules
import { useEffect, useRef } from 'react';
function useMemoOnce(key, fn) {
  const last = useRef(null);
  useEffect(() => {
    if (last.current !== key) { last.current = key; fn(); }
  }, [key, fn]);
}
