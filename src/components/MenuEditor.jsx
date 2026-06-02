import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import ManagerPinModal from './ManagerPinModal.jsx';
import { useApp } from '../state/AppContext.jsx';
import { formatPKR } from '../lib/format.js';
import { saveMenuItem, deleteMenuItem } from '../data-layer/index.js';

// Brand-new item id pattern matches existing seed: M### plus a random tail
// when conflicting. Order isn't significant; the Sheet sorts on its own.
function newItemId(menu) {
  const nums = menu.map((m) => Number(String(m.item_id).replace(/^M/, ''))).filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'M' + String(next).padStart(3, '0');
}

const BLANK = (outlet_id) => ({
  item_id: '',           // assigned on save
  outlet_id,
  category: '',
  name: '',
  price_pkr: 0,
  available: true,
  image_url: '',
  modifier_group_ids: [],
});

export default function MenuEditor({ open, onClose }) {
  const { menu, modifierGroups, config, refreshAll } = useApp();
  const [draft, setDraft] = useState(null);          // currently being edited or created
  const [pendingSave, setPendingSave] = useState(null);    // { mode, draft }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [filter, setFilter] = useState('');

  const categories = useMemo(() => [...new Set(menu.map((m) => m.category))].filter(Boolean), [menu]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.item_id.toLowerCase().includes(q)
    );
  }, [menu, filter]);

  const grouped = useMemo(() => {
    const map = {};
    for (const item of visible) {
      const c = item.category || 'Uncategorised';
      (map[c] ||= []).push(item);
    }
    return map;
  }, [visible]);

  const startCreate = () => setDraft({ ...BLANK(config.outlet_id), category: categories[0] || '' });
  const startEdit   = (item) => setDraft({ ...item });
  const update      = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const toggleGroup = (group_id) =>
    update({
      modifier_group_ids: draft.modifier_group_ids.includes(group_id)
        ? draft.modifier_group_ids.filter((x) => x !== group_id)
        : [...draft.modifier_group_ids, group_id],
    });

  const requestSave = () => {
    if (!draft.name.trim() || !draft.category.trim()) return;
    const isNew = !draft.item_id;
    const final = isNew
      ? { ...draft, item_id: newItemId(menu), price_pkr: Number(draft.price_pkr) || 0 }
      : { ...draft, price_pkr: Number(draft.price_pkr) || 0 };
    setPendingSave({ mode: isNew ? 'create' : 'edit', draft: final });
  };

  const requestDelete = (item) => setPendingDelete(item);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Menu admin"
        wide
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              {menu.length} item{menu.length === 1 ? '' : 's'} ·
              {' '}{categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
            </span>
            <button onClick={startCreate} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold">
              + Add item
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name, category, or ID"
            className="w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border text-sm"
          />

          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-2">{cat}</h4>
              <ul className="divide-y divide-paolas-border">
                {items.map((it) => (
                  <li key={it.item_id} className="py-2 flex items-center gap-3">
                    {it.image_url && (
                      <img src={it.image_url} alt="" className="w-12 h-12 rounded object-cover bg-paolas-bg" referrerPolicy="no-referrer" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{it.name}</span>
                        {!it.available && <span className="text-[10px] uppercase text-red-400">86</span>}
                      </div>
                      <div className="text-xs text-gray-400">{it.item_id} · {formatPKR(it.price_pkr)}</div>
                    </div>
                    <button onClick={() => startEdit(it)} className="min-h-tap px-3 rounded-lg bg-paolas-border text-xs">Edit</button>
                    <button onClick={() => requestDelete(it)} className="min-h-tap px-3 rounded-lg bg-red-900/40 border border-red-700/40 text-red-200 text-xs">Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {!visible.length && <p className="text-sm text-gray-500 italic">No items match.</p>}
        </div>
      </Modal>

      {/* Per-item draft editor */}
      {draft && (
        <Modal
          open
          onClose={() => setDraft(null)}
          title={draft.item_id ? `Edit ${draft.name || draft.item_id}` : 'New item'}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="min-h-tap px-4 py-2 rounded-lg bg-paolas-border">Cancel</button>
              <button
                onClick={requestSave}
                disabled={!draft.name.trim() || !draft.category.trim()}
                className="min-h-tap px-4 py-2 rounded-lg bg-paolas-accent font-semibold disabled:opacity-40"
              >
                Save (manager)
              </button>
            </div>
          }
        >
          <div className="p-5 space-y-3 text-sm">
            <Field label="Name" value={draft.name} onChange={(v) => update({ name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (PKR)" type="number" value={draft.price_pkr} onChange={(v) => update({ price_pkr: v })} />
              <Field
                label="Category"
                value={draft.category}
                onChange={(v) => update({ category: v })}
                datalist={categories}
                placeholder="Starters / Pizza / Drinks / …"
              />
            </div>
            <Field label="Image URL" value={draft.image_url} onChange={(v) => update({ image_url: v })} placeholder="https://… (optional)" />
            {draft.image_url && (
              <img src={draft.image_url} alt="preview" className="w-full max-h-40 object-cover rounded-lg bg-paolas-bg" referrerPolicy="no-referrer" />
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!draft.available} onChange={(e) => update({ available: e.target.checked })} className="w-5 h-5" />
              <span>Available (uncheck = 86'd)</span>
            </label>
            <div>
              <div className="text-xs text-gray-400 mb-2">Modifier groups</div>
              <div className="flex flex-wrap gap-2">
                {modifierGroups.map((g) => {
                  const on = draft.modifier_group_ids.includes(g.group_id);
                  return (
                    <button
                      key={g.group_id}
                      onClick={() => toggleGroup(g.group_id)}
                      className={`text-xs px-3 py-1.5 rounded-full border ${on ? 'bg-paolas-accent border-paolas-accent' : 'bg-paolas-border border-paolas-border'}`}
                    >
                      {g.name}
                    </button>
                  );
                })}
                {!modifierGroups.length && <span className="text-xs text-gray-500">No modifier groups defined yet.</span>}
              </div>
            </div>
          </div>
        </Modal>
      )}

      <ManagerPinModal
        open={!!pendingSave}
        onClose={() => setPendingSave(null)}
        action={pendingSave?.mode === 'create' ? 'menu_create' : 'menu_edit'}
        bill_id=""
        detail={pendingSave ? `${pendingSave.draft.name} (${pendingSave.draft.item_id})` : ''}
        requireReason
        onApproved={async () => {
          if (!pendingSave) return;
          await saveMenuItem(pendingSave.draft);
          setPendingSave(null);
          setDraft(null);
          await refreshAll();
        }}
      />
      <ManagerPinModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        action="menu_delete"
        bill_id=""
        detail={pendingDelete ? `${pendingDelete.name} (${pendingDelete.item_id})` : ''}
        requireReason
        onApproved={async () => {
          if (!pendingDelete) return;
          await deleteMenuItem(pendingDelete.item_id);
          setPendingDelete(null);
          await refreshAll();
        }}
      />
    </>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, datalist }) {
  const listId = datalist ? `dl-${label.replace(/\s+/g, '_')}` : undefined;
  return (
    <label className="block">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="mt-1 w-full min-h-tap px-3 py-2 rounded-lg bg-paolas-bg border border-paolas-border"
      />
      {datalist && (
        <datalist id={listId}>
          {datalist.map((v) => <option key={v} value={v} />)}
        </datalist>
      )}
    </label>
  );
}
