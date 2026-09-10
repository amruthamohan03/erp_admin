'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { fetchMasterOptions, type SelectOption } from '@/lib/selectOptions';

interface SubOfficeRow {
  id: number;
  sub_office_name: string;
  /** The regional office this desk reports to (migration 0077). */
  main_office_id: number | null;
  main_office_name: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function SubOfficesPage() {
  const [items, setItems] = useState<SubOfficeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SubOfficeRow | null>(null);
  const [mainOffices, setMainOffices] = useState<SelectOption[]>([]);
  const [officeFilter, setOfficeFilter] = useState('');
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  // The regional offices, through the shared fetcher (§4.16, §4.10).
  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await fetchMasterOptions('main-offices', 'main_location_name');
      if (!live) return;
      setMainOffices(rows.map((o) => ({ value: String(o.id), label: o.label })));
    })();
    return () => {
      live = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (officeFilter) params.set('main_office_id', officeFilter);
      const res = await fetch(`/api/v1/sub-offices?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, officeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this declaration office?')) return;
    const res = await fetch(`/api/v1/sub-offices/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This declaration office could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The declaration office has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary-600" />
            Declaration Offices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customs declaration desks under the regional office. Distinct
            from <code>main_office_master_t</code> (the regional office itself).
          </p>
        </div>
      </div>

      <DataTable<SubOfficeRow>
        rows={items}
        loading={loading}
        rowKey={(s) => s.id}
        searchPlaceholder="Search declaration office or main office..."
        emptyMessage={
          officeFilter
            ? 'No declaration offices under this main office yet — create the first one.'
            : 'No declaration offices yet — create the first one.'
        }
        filters={
          <SearchableSelect
            size="sm"
            className="w-48"
            aria-label="Main office"
            value={officeFilter}
            options={mainOffices}
            emptyLabel="All Main Offices"
            placeholder="All Main Offices"
            onChange={(v) => {
              setOfficeFilter(v);
              setPage(1);
            }}
          />
        }
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Declaration Office
          </button>
        }
        columns={[
        { key: 'sub_office_name', header: 'Declaration Office', sortable: true, className: 'font-medium' },
        {
          key: 'main_office_name',
          header: 'Main Office',
          sortable: true,
          // An unassigned desk is flagged, not blanked: the column is what tells
          // an operator which rows still need the link filled in.
          render: (s: SubOfficeRow) =>
            s.main_office_name ?? (
              <span className="text-amber-700 dark:text-amber-400">Not assigned</span>
            ),
        },
        ]}
        actions={(s) => ({ edit: () => setEditing(s), remove: () => handleDelete(s.id) })}
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
        <SubOfficeFormModal
          mainOffices={mainOffices}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The declaration office has been created.' });
          }}
        />
      )}

      {editing && (
        <SubOfficeFormModal
          subOffice={editing}
          mainOffices={mainOffices}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this declaration office have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function SubOfficeFormModal({
  subOffice,
  mainOffices,
  onClose,
  onSaved,
}: {
  subOffice?: SubOfficeRow;
  mainOffices: SelectOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!subOffice;
  const [name, setName] = useState(subOffice?.sub_office_name || '');
  // A string: a `<SearchableSelect>` value is always a string, and a number
  // silently never matches an option (§4.16).
  const [mainOfficeId, setMainOfficeId] = useState(
    subOffice?.main_office_id != null ? String(subOffice.main_office_id) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise.
  const checkValue = isEdit && name === subOffice?.sub_office_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'sub-offices',
    value: checkValue,
    excludeId: subOffice?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/sub-offices/${subOffice!.id}`
      : '/api/v1/sub-offices';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub_office_name: name,
          main_office_id: mainOfficeId ? Number(mainOfficeId) : null,
        }),
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
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Declaration Office' : 'Create Declaration Office'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
            <label className="label required">Declaration Office Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="DGDA Kinshasa Port"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
          </div>
          <div>
            {/* §4.1 / §4.16 — the desk's place in the hierarchy, picked from the
                master rather than implied by its name. */}
            <label className="label">Main Office</label>
            <SearchableSelect
              aria-label="Main office"
              value={mainOfficeId}
              onChange={setMainOfficeId}
              options={mainOffices}
              emptyLabel="— Not assigned —"
              placeholder="Select main office..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The regional office this declaration desk reports to.
            </p>
          </div>
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
