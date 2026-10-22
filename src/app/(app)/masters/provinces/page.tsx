'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ActiveToggleField from '@/components/ui/ActiveToggleField';
import { displayStatusColumn, setDisplay } from '@/lib/masters/displayToggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';

interface Row {
  id: number;
  province_name: string;
  origin_id: number | null;
  origin_name: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface OriginOpt {
  id: number;
  origin_name: string;
}

export default function ProvincesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);
  const [origins, setOrigins] = useState<OriginOpt[]>([]);

  // Origin picker data — used by the form modal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The origins picker is optional; the form still opens without it.
      const res = await safeFetchJson<OriginOpt[]>('/api/v1/origins?pageSize=200');
      if (!cancelled && res.ok) setOrigins(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        // The master lists disabled rows too, so they can be switched back on.
        include_disabled: 'true',
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await safeFetchJson<Row[]>(`/api/v1/provinces?${params}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(typeof res.meta?.total === 'number' ? res.meta.total : 0);
      } else {
        setResult({ status: 'error', title: 'Not loaded', message: res.message, detail: res.detail });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this province?')) return;
    const res = await safeFetchJson(`/api/v1/provinces/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The province has been disabled.' });
    load();
  }

  async function handleToggle(r: Row, active: boolean) {
    setResult(await setDisplay(`/api/v1/provinces/${r.id}`, active, r.province_name));
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Provinces</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/provinces/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search province, origin..."
        emptyMessage="No provinces yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Province
          </button>
        }
        columns={[
        { key: 'province_name', header: 'Province', sortable: true, className: 'font-medium' },
        { key: 'origin_name', header: 'Origin', className: 'text-foreground', render: (r: Row) => (
            <>
            {r.origin_name ?? `#${r.origin_id}`}
            </>
          ) },
        displayStatusColumn<Row>({ nameOf: (r) => r.province_name, onToggle: handleToggle }),
        ]}
        // A disabled row has nothing left to delete — the switch re-enables it.
        actions={(r) => ({
          edit: () => setEditing(r),
          ...(r.display === 'Y' ? { remove: () => handleDelete(r.id) } : {}),
        })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {showCreate && (
        <FormModal
          origins={origins}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The province has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          origins={origins}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this province have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  origins,
  onClose,
  onSaved,
}: {
  row?: Row;
  origins: OriginOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.province_name || '');
  const [originId, setOriginId] = useState<number>(
    row?.origin_id ?? (origins[0]?.id ?? 1),
  );
  const [active, setActive] = useState(row ? row.display === 'Y' : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === row?.province_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'provinces',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/provinces/${row!.id}` : '/api/v1/provinces';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          province_name: name,
          origin_id: originId,
          display: active ? 'Y' : 'N',
        }),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Province' : 'Create Province'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Province Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={255}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div>
            <label className="label required">Origin</label>
            <SearchableSelect
              value={String(originId)}
              required
              options={origins.map((o) => ({ value: String(o.id), label: o.origin_name }))}
              onChange={(v) => setOriginId(Number(v))}
            />
          </div>
          <ActiveToggleField checked={active} onChange={setActive} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || status === 'taken'}
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
