'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X, Eye, EyeOff } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import type { MenuItem } from '@/types/menu';

interface MenuRow extends MenuItem {
  parent_name: string | null;
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuRow[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MenuRow | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ flat: '1', all: '1' });
      if (showHidden) params.set('includeHidden', '1');
      const res = await fetch(`/api/v1/menus?${params}`);
      const json = await res.json();
      if (json.ok) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  // Re-fetch the menu list whenever the showHidden filter flips (via load deps).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Top-level menus only — used as parent options (enforces 2-level rule).
  const topLevelOptions = useMemo(
    () => items.filter((m) => (m.menu_level ?? 0) === 0),
    [items],
  );

  async function handleDelete(id: number) {
    if (!confirm('Disable this menu? Children must be disabled first.')) return;
    const res = await fetch(`/api/v1/menus/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This menu could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The menu has been disabled.' });
    load();
  }

  async function toggleVisibility(m: MenuRow) {
    const res = await fetch(`/api/v1/menus/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: m.display === 'Y' ? 'N' : 'Y' }),
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This menu could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The menu has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage sidebar menus. Maximum 2 levels (parent + child).
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Menu
        </button>
      </div>

      <DataTable<MenuRow>
        rows={items}
        loading={loading}
        rowKey={(m) => m.id}
        searchPlaceholder="Search name, url, parent..."
        emptyMessage="No menus yet — create the first one."
        filters={
          <Toggle checked={showHidden} onChange={setShowHidden} label="Show disabled" />
        }
        columns={[
          {
            key: 'menu_name',
            header: 'Menu Name',
            sortable: true,
            render: (m) => {
              const isParent = (m.menu_level ?? 0) === 0;
              return (
                <span className={isParent ? 'font-semibold' : 'pl-4'}>
                  {!isParent && <span className="text-muted-foreground">└ </span>}
                  {m.menu_name}
                </span>
              );
            },
          },
          { key: 'parent_name', header: 'Parent', sortable: true },
          {
            key: 'menu_level',
            header: 'Level',
            sortable: true,
            render: (m) => {
              const isParent = (m.menu_level ?? 0) === 0;
              return (
                <span
                  className={
                    isParent
                      ? 'inline-block rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700'
                      : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                  }
                >
                  {isParent ? 'Parent' : 'Child'}
                </span>
              );
            },
          },
          { key: 'menu_order', header: 'Order', sortable: true },
          {
            key: 'url',
            header: 'URL',
            render: (m) => <code className="text-xs text-slate-600">{m.url || '—'}</code>,
          },
          {
            key: 'icon',
            header: 'Icon',
            render: (m) =>
              m.icon ? (
                <span className="inline-flex items-center gap-1 text-xs">
                  <i className={m.icon} />
                  <code className="text-muted-foreground">{m.icon}</code>
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'display',
            header: 'Status',
            sortable: true,
            render: (m) => (
              <span
                className={
                  m.display === 'Y'
                    ? 'inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                    : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-muted-foreground'
                }
              >
                {m.display === 'Y' ? 'Active' : 'Disabled'}
              </span>
            ),
          },
        ]}
        actions={(m) => ({
          edit: () => setEditing(m),
          remove: () => handleDelete(m.id),
          // Visibility is neither view/edit/delete, so it keeps its own hue (§4.20).
          extra: (
            <button
              onClick={() => toggleVisibility(m)}
              className="ico ms-1 text-amber-600 hover:bg-accent"
              title={m.display === 'Y' ? 'Disable' : 'Enable'}
            >
              {m.display === 'Y' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          ),
        })}
      />

      {showCreate && (
        <MenuFormModal
          parents={topLevelOptions}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The menu has been created.' });
          }}
        />
      )}

      {editing && (
        <MenuFormModal
          parents={topLevelOptions.filter((p) => p.id !== editing.id)}
          menu={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this menu have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function MenuFormModal({
  menu,
  parents,
  onClose,
  onSaved,
}: {
  menu?: MenuRow;
  parents: MenuRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!menu;
  const [form, setForm] = useState({
    menu_name: menu?.menu_name || '',
    url: menu?.url || '#',
    text: menu?.text || '',
    icon: menu?.icon || '',
    badge: menu?.badge || '',
    menu_id: menu?.menu_id ? String(menu.menu_id) : '',
    menu_order: menu?.menu_order ?? 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/menus/${menu!.id}` : '/api/v1/menus';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      menu_name: form.menu_name,
      url: form.url || '#',
      text: form.text || null,
      icon: form.icon || null,
      badge: form.badge || null,
      menu_id: form.menu_id ? Number(form.menu_id) : null,
      menu_order: Number(form.menu_order) || 1,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Menu' : 'Create Menu'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="label required">Menu Name</label>
            <input
              className="input"
              value={form.menu_name}
              onChange={(e) => setForm({ ...form, menu_name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Parent Menu</label>
              <SearchableSelect
                value={form.menu_id}
                onChange={(v) => setForm({ ...form, menu_id: v })}
                options={parents.map((p) => ({
                  value: String(p.id),
                  label: p.menu_name,
                }))}
                emptyLabel="— None (top-level) —"
                placeholder="Select parent..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty for a top-level menu.
              </p>
            </div>
            <div>
              <label className="label">Order</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.menu_order}
                onChange={(e) =>
                  setForm({ ...form, menu_order: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div>
            <label className="label">URL</label>
            <input
              className="input"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="e.g. menu/index or # for groups"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code>#</code> for parent groups that just expand. Otherwise use
              paths like <code>users/index</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Icon (Tabler class)</label>
              <input
                className="input"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="ti ti-dashboard"
              />
              {form.icon && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  Preview: <i className={form.icon} />
                </p>
              )}
            </div>
            <div>
              <label className="label">Badge</label>
              <input
                className="input"
                value={form.badge}
                onChange={(e) => setForm({ ...form, badge: e.target.value })}
                placeholder="New, Beta..."
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Optional description / tooltip"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
