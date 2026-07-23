'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';

// §4.12 page-builder — admin CRUD over master_page. Ported from main and
// adapted to this branch's /api/v1 routes + { ok, data } envelope.
interface MasterPage {
  id: number;
  slug: string;
  title: string;
  route: string;
  target_table: string;
  display_order: number;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

// Sidebar deep-links use ?tab=accordions / fields / roles to control which tab
// opens on the detail page. We forward whatever's on this list page's URL into
// each row's edit link so the click-through preserves intent.
const VALID_TABS = ['accordions', 'fields', 'roles'] as const;

export default function MasterPagesListPage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
      <MasterPagesList />
    </Suspense>
  );
}

function MasterPagesList() {
  const [items, setItems] = useState<MasterPage[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const tabHint = searchParams.get('tab');
  const editSuffix = VALID_TABS.includes(tabHint as (typeof VALID_TABS)[number])
    ? `?tab=${tabHint}`
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await safeFetchJson<MasterPage[]>('/api/v1/master-pages');
    if (result.ok) {
      setItems(result.data);
    } else {
      setLoadError(
        [
          result.message,
          result.status ? `(status ${result.status})` : null,
          result.detail ? `\nDetail: ${result.detail}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.slug?.toLowerCase().includes(q) ||
        i.title?.toLowerCase().includes(q) ||
        i.target_table?.toLowerCase().includes(q),
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
    if (
      !confirm(
        'Disable this page? Existing references to it will still work until the runtime stops finding it.',
      )
    )
      return;
    const res = await fetch(`/api/v1/master-pages/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message || 'Failed');
      return;
    }
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactional Pages</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure §4.12 pages — slug, title, target table, accordions, role grants, and fields.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Page
        </button>
      </div>

      {loadError && (
        <div className="rounded-md bg-red-50 p-3 mb-4 text-sm text-red-700 border border-red-200 whitespace-pre-wrap">
          {loadError}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search slug, title, target table..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Slug</th>
                <th>Title</th>
                <th>Route</th>
                <th>Target Table</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    No pages found — click <strong>New Page</strong>.
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((i, idx) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                    <td className="font-mono text-xs">{i.slug}</td>
                    <td className="font-medium">{i.title}</td>
                    <td className="font-mono text-xs">{i.route}</td>
                    <td className="font-mono text-xs">{i.target_table}</td>
                    <td>
                      <span
                        className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${
                          i.display === 'Y'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {i.display === 'Y' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/masters/pages/${i.id}${editSuffix}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Configure"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(i.id)}
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
        <CreatePageModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </>
  );
}

function CreatePageModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    slug: '',
    title: '',
    route: '',
    target_table: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unique = useUniqueCheck({
    resource: 'master-pages',
    value: form.slug,
    excludeId: null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unique.status === 'taken') {
      setError('Slug already exists');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/master-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">Create Page</h2>
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
            <label className="label">
              Slug *{' '}
              <span className="text-xs text-slate-500 ml-1">(URL key, lowercase + hyphens)</span>
            </label>
            <input
              className="input font-mono"
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
              }
              required
              maxLength={100}
            />
            <UniquenessIndicator status={unique.status} message={unique.message} />
          </div>
          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="label">Route *</label>
            <input
              className="input font-mono"
              value={form.route}
              placeholder="/example"
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="label">
              Target Table *{' '}
              <span className="text-xs text-slate-500 ml-1">
                (must be in src/lib/pages/targets.ts whitelist)
              </span>
            </label>
            <input
              className="input font-mono"
              value={form.target_table}
              placeholder="clients_t"
              onChange={(e) => setForm({ ...form, target_table: e.target.value })}
              required
              maxLength={100}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || unique.status === 'taken'}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
