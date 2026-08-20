'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
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
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <MasterPagesList />
    </Suspense>
  );
}

function MasterPagesList() {
  const [items, setItems] = useState<MasterPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

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
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This page could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The page has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactional Pages</h1>
          <p className="text-sm text-muted-foreground mt-1">
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

      <DataTable<MasterPage>
        rows={items}
        loading={loading}
        rowKey={(i) => i.id}
        searchPlaceholder="Search slug, title, target table..."
        emptyMessage="No record yet — create the first one."
        columns={[
        { key: 'slug', header: 'Slug', sortable: true, className: 'font-mono text-xs' },
        { key: 'title', header: 'Title', sortable: true, className: 'font-medium' },
        { key: 'route', header: 'Route', sortable: true, className: 'font-mono text-xs' },
        { key: 'target_table', header: 'Target Table', sortable: true, className: 'font-mono text-xs' },
        { key: '5', header: 'Status', render: (i: MasterPage) => (
            <>
            <span
                        className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${
                          i.display === 'Y'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-muted-foreground'
                        }`}
                      >
                        {i.display === 'Y' ? 'Active' : 'Inactive'}
                      </span>
            </>
          ) },
        ]}
        actions={(i) => ({ edit: `/masters/pages/${i.id}${editSuffix}`, remove: () => handleDelete(i.id) })}
      />

      {showCreate && (
        <CreatePageModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The page has been created.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
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
            <label className="label">
              Slug *{' '}
              <span className="text-xs text-muted-foreground ml-1">(URL key, lowercase + hyphens)</span>
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
            <label className="label required">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="label required">Route</label>
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
              <span className="text-xs text-muted-foreground ml-1">
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
