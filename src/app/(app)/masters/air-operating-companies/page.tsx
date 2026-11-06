'use client';

// Masters → Air Operating Companies: the list Import Tracking's Operating Company
// dropdown reads (Logistics & Transport).
import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import ActiveToggleField from '@/components/ui/ActiveToggleField';
import { displayStatusColumn, setDisplay } from '@/lib/masters/displayToggle';

const API = '/api/v1/air-operating-companies';

interface Row {
  id: number;
  air_operating_company_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function AirOperatingCompaniesPage() {
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
      const res = await safeFetchJson<Row[]>(`${API}?${params}`);
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

  async function handleDelete(r: Row) {
    if (!confirm(`Disable the air operating company "${r.air_operating_company_name}"?`)) return;
    const res = await safeFetchJson(`${API}/${r.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: `"${r.air_operating_company_name}" has been disabled.` });
    load();
  }

  async function handleToggle(r: Row, active: boolean) {
    setResult(await setDisplay(`${API}/${r.id}`, active, r.air_operating_company_name));
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Air Operating Companies</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/air-operating-companies/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search air operating company name..."
        emptyMessage="No air operating companies yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Air Operating Company
          </button>
        }
        columns={[
          { key: 'air_operating_company_name', header: 'Air Operating Company', sortable: true, className: 'font-medium' },
          displayStatusColumn<Row>({ nameOf: (r) => r.air_operating_company_name, onToggle: handleToggle }),
        ]}
        // A disabled row has nothing left to delete — the switch re-enables it.
        actions={(r) => ({
          edit: () => setEditing(r),
          ...(r.display === 'Y' ? { remove: () => handleDelete(r) } : {}),
        })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: (q) => {
            setSearch(q);
            setPage(1);
          },
        }}
      />

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={(name) => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: `"${name}" has been added.` });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: `Your changes to "${name}" have been saved.` });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({ row, onClose, onSaved }: { row?: Row; onClose: () => void; onSaved: (name: string) => void }) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.air_operating_company_name || '');
  const [active, setActive] = useState(row ? row.display === 'Y' : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === row?.air_operating_company_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'air-operating-companies',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError(`"${name}" already exists — use a different name, or switch the existing one back on.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await safeFetchJson(isEdit ? `${API}/${row!.id}` : API, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ air_operating_company_name: name.trim(), display: active ? 'Y' : 'N' }),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSaved(name.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{isEdit ? 'Edit Air Operating Company' : 'Create Air Operating Company'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className="label required" htmlFor="air-operating-company-name">
              Air Operating Company Name
            </label>
            <input
              id="air-operating-company-name"
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              // The width of imports_t.operating_company, which this name is copied into.
              maxLength={50}
              autoFocus
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <ActiveToggleField checked={active} onChange={setActive} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || status === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
