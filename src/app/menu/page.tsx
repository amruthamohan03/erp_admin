'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X, Eye, EyeOff } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import type { MenuItem } from '@/types/menu';

interface MenuRow extends MenuItem {
  parent_name: string | null;
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuRow[]>([]);
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MenuRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ flat: '1' });
      if (showHidden) params.set('includeHidden', '1');
      const res = await fetch(`/api/menus?${params}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    load();
  }, [load]);

  // Top-level menus only — used as parent options (enforces 2-level rule).
  const topLevelOptions = useMemo(
    () => items.filter((m) => (m.menu_level ?? 0) === 0),
    [items],
  );

  // Apply search filter on the client (the list is small, ~110 rows).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.menu_name?.toLowerCase().includes(q) ||
        m.url?.toLowerCase().includes(q) ||
        m.parent_name?.toLowerCase().includes(q),
    );
  }, [items, search]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this menu? Children must be disabled first.')) return;
    const res = await fetch(`/api/menus/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  async function toggleVisibility(m: MenuRow) {
    const res = await fetch(`/api/menus/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: m.display === 'Y' ? 'N' : 'Y' }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage sidebar menus. Maximum 2 levels (parent + child).
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Menu
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name, url, parent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show disabled
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>ID</th>
                <th>Menu Name</th>
                <th>Parent</th>
                <th>Level</th>
                <th>Order</th>
                <th>URL</th>
                <th>Icon</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-8">
                    No menus found
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((m) => {
                  const isParent = (m.menu_level ?? 0) === 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td>{m.id}</td>
                      <td>
                        <span className={isParent ? 'font-semibold' : 'pl-4'}>
                          {!isParent && <span className="text-slate-400">└ </span>}
                          {m.menu_name}
                        </span>
                      </td>
                      <td className="text-slate-600">{m.parent_name || '—'}</td>
                      <td>
                        <span
                          className={
                            isParent
                              ? 'inline-block rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700'
                              : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                          }
                        >
                          {isParent ? 'Parent' : 'Child'}
                        </span>
                      </td>
                      <td>{m.menu_order}</td>
                      <td>
                        <code className="text-xs text-slate-600">{m.url || '—'}</code>
                      </td>
                      <td>
                        {m.icon ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <i className={m.icon} />
                            <code className="text-slate-500">{m.icon}</code>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            m.display === 'Y'
                              ? 'inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                              : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500'
                          }
                        >
                          {m.display === 'Y' ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleVisibility(m)}
                          className="text-slate-500 hover:text-amber-600 p-1"
                          title={m.display === 'Y' ? 'Disable' : 'Enable'}
                        >
                          {m.display === 'Y' ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditing(m)}
                          className="text-slate-500 hover:text-primary-600 p-1 ml-1"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="text-slate-500 hover:text-red-600 p-1 ml-1"
                          title="Disable"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-200 text-sm text-slate-500">
          Showing {filtered.length} of {items.length}
        </div>
      </div>

      {showCreate && (
        <MenuFormModal
          parents={topLevelOptions}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
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
          }}
        />
      )}
    </DashboardShell>
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

    const url = isEdit ? `/api/menus/${menu!.id}` : '/api/menus';
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
      if (!res.ok || !json.success) {
        setError(json.message || 'Save failed');
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
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
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
            <label className="label">Menu Name *</label>
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
              <select
                className="input"
                value={form.menu_id}
                onChange={(e) => setForm({ ...form, menu_id: e.target.value })}
              >
                <option value="">— None (top-level) —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.menu_name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
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
            <p className="text-xs text-slate-500 mt-1">
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
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
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
