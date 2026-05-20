'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  Eye,
  EyeOff,
  LayoutDashboard,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { MenuItem } from '@/types/menu';

interface CardRow {
  id: number;
  card_key: string;
  card_content_id: string;
  card_title: string;
  card_subtitle: string | null;
  card_icon: string | null;
  card_color: string | null;
  card_url: string | null;
  card_order: number;
  card_category: string | null;
  menu_id: number | null;
  menu_name: string | null;
  data_source: string | null;
  display: 'Y' | 'N';
}

const COLOR_OPTIONS = [
  'primary',
  'success',
  'warning',
  'danger',
  'info',
  'purple',
  'teal',
  'pink',
];

const CATEGORY_OPTIONS = ['general', 'import', 'export', 'finance', 'admin'];

export default function DashboardCardsPage() {
  const [items, setItems] = useState<CardRow[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CardRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showHidden) params.set('includeHidden', '1');
      const res = await fetch(`/api/dashboard-cards?${params}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/menus?flat=1&all=1')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setMenus(j.data);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.card_title?.toLowerCase().includes(q) ||
        m.card_key?.toLowerCase().includes(q) ||
        m.card_subtitle?.toLowerCase().includes(q) ||
        m.card_category?.toLowerCase().includes(q) ||
        m.menu_name?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
    totalPages,
    startIndex,
    paged,
    mounted,
    resetPage,
  } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this dashboard card?')) return;
    const res = await fetch(`/api/dashboard-cards/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  async function toggleVisibility(c: CardRow) {
    const res = await fetch(`/api/dashboard-cards/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: c.display === 'Y' ? 'N' : 'Y' }),
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
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary-600" />
            Dashboard Cards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the cards available on the dashboard. Per-role visibility is
            set in Role &rarr; Dashboard Cards mapping.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Card
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search title, key, subtitle, category, menu..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>
          <Toggle
            checked={showHidden}
            onChange={(v) => {
              setShowHidden(v);
              resetPage();
            }}
            label="Show disabled"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Title</th>
                <th>Key</th>
                <th>Category</th>
                <th>Color</th>
                <th>Icon</th>
                <th>Menu</th>
                <th>Order</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 py-8">
                    No cards found
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      <div className="font-medium">{m.card_title}</div>
                      {m.card_subtitle && (
                        <div className="text-xs text-slate-500">
                          {m.card_subtitle}
                        </div>
                      )}
                    </td>
                    <td>
                      <code className="text-xs text-slate-600">
                        {m.card_key}
                      </code>
                    </td>
                    <td>
                      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {m.card_category || '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs text-white ${colorClass(m.card_color)}`}
                      >
                        {m.card_color || '—'}
                      </span>
                    </td>
                    <td>
                      {m.card_icon ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <i className={`bi ${m.card_icon}`} />
                          <code className="text-slate-500">{m.card_icon}</code>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-slate-600 text-sm">
                      {m.menu_name || '—'}
                    </td>
                    <td>{m.card_order}</td>
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
                ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          totalRows={totalRows}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {showCreate && (
        <CardFormModal
          menus={menus}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {editing && (
        <CardFormModal
          menus={menus}
          card={editing}
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

function colorClass(color: string | null | undefined): string {
  switch ((color ?? '').toLowerCase()) {
    case 'success':
      return 'bg-emerald-500';
    case 'warning':
      return 'bg-amber-500';
    case 'danger':
      return 'bg-red-500';
    case 'info':
      return 'bg-sky-500';
    case 'purple':
      return 'bg-purple-500';
    case 'teal':
      return 'bg-teal-500';
    case 'pink':
      return 'bg-pink-500';
    case 'primary':
    default:
      return 'bg-blue-500';
  }
}

function CardFormModal({
  card,
  menus,
  onClose,
  onSaved,
}: {
  card?: CardRow;
  menus: MenuItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!card;
  const [form, setForm] = useState({
    card_key: card?.card_key || '',
    card_content_id: card?.card_content_id || '',
    card_title: card?.card_title || '',
    card_subtitle: card?.card_subtitle || '',
    card_icon: card?.card_icon || 'bi-card-text',
    card_color: card?.card_color || 'primary',
    card_url: card?.card_url || '',
    card_order: card?.card_order ?? 0,
    card_category: card?.card_category || 'general',
    menu_id: card?.menu_id ? String(card.menu_id) : '',
    data_source: card?.data_source || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/dashboard-cards/${card!.id}`
      : '/api/dashboard-cards';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      card_key: form.card_key,
      card_content_id: form.card_content_id,
      card_title: form.card_title,
      card_subtitle: form.card_subtitle || null,
      card_icon: form.card_icon || null,
      card_color: form.card_color || null,
      card_url: form.card_url || null,
      card_order: Number(form.card_order) || 0,
      card_category: form.card_category || null,
      menu_id: form.menu_id ? Number(form.menu_id) : null,
      data_source: form.data_source || null,
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
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Dashboard Card' : 'Create Dashboard Card'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Card Key *</label>
              <input
                className="input"
                value={form.card_key}
                onChange={(e) =>
                  setForm({ ...form, card_key: e.target.value })
                }
                placeholder="e.g. total_users"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Unique identifier. Lowercase + underscores recommended.
              </p>
            </div>
            <div>
              <label className="label">Content Id *</label>
              <input
                className="input"
                value={form.card_content_id}
                onChange={(e) =>
                  setForm({ ...form, card_content_id: e.target.value })
                }
                placeholder="e.g. users_count"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              value={form.card_title}
              onChange={(e) =>
                setForm({ ...form, card_title: e.target.value })
              }
              required
            />
          </div>

          <div>
            <label className="label">Subtitle</label>
            <input
              className="input"
              value={form.card_subtitle}
              onChange={(e) =>
                setForm({ ...form, card_subtitle: e.target.value })
              }
              placeholder="Short description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Icon (Bootstrap class)</label>
              <input
                className="input"
                value={form.card_icon}
                onChange={(e) =>
                  setForm({ ...form, card_icon: e.target.value })
                }
                placeholder="bi-card-text"
              />
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                Preview: <i className={`bi ${form.card_icon}`} />
              </p>
            </div>
            <div>
              <label className="label">Color theme</label>
              <SearchableSelect
                value={form.card_color}
                onChange={(v) => setForm({ ...form, card_color: v })}
                options={COLOR_OPTIONS.map((c) => ({ value: c, label: c }))}
                placeholder="Select color..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <SearchableSelect
                value={form.card_category}
                onChange={(v) => setForm({ ...form, card_category: v })}
                options={CATEGORY_OPTIONS.map((c) => ({
                  value: c,
                  label: c,
                }))}
                placeholder="Select category..."
              />
            </div>
            <div>
              <label className="label">Order</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.card_order}
                onChange={(e) =>
                  setForm({ ...form, card_order: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Link URL</label>
              <input
                className="input"
                value={form.card_url}
                onChange={(e) =>
                  setForm({ ...form, card_url: e.target.value })
                }
                placeholder="/users or https://..."
              />
            </div>
            <div>
              <label className="label">Linked Menu</label>
              <SearchableSelect
                value={form.menu_id}
                onChange={(v) => setForm({ ...form, menu_id: v })}
                options={menus.map((m) => ({
                  value: String(m.id),
                  label: m.menu_name,
                }))}
                emptyLabel="— None —"
                placeholder="Select menu..."
              />
            </div>
          </div>

          <div>
            <label className="label">Data Source</label>
            <input
              className="input"
              value={form.data_source}
              onChange={(e) =>
                setForm({ ...form, data_source: e.target.value })
              }
              placeholder="/api/users?pageSize=1  (must return { value })"
            />
            <p className="text-xs text-slate-500 mt-1">
              Optional API path. If set, the dashboard fetches it and shows{' '}
              <code>data.value</code> (or <code>data.total</code>) on the card.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
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
