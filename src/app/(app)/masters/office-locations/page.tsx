'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface OfficeLocationRow {
  id: number;
  location_name: string;
  province_id: number | null;
  province_name: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface ProvinceOption {
  id: number;
  province_name: string;
}

export default function OfficeLocationsPage() {
  const [items, setItems] = useState<OfficeLocationRow[]>([]);
  const [provinces, setProvinces] = useState<ProvinceOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<OfficeLocationRow | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/office-locations?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/provinces?pageSize=100');
        const json = await res.json();
        if (json.ok) {
          const list = (json.data ?? []) as Array<Record<string, unknown>>;
          setProvinces(
            list.map((r) => ({
              id: r.id as number,
              province_name: String(r.province_name ?? r.id),
            })),
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Disable this office location? References from clients stay intact.')) return;
    const res = await fetch(`/api/v1/office-locations/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This office location could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The office location has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary-600" />
            Office Locations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Client issuing / branch-reporting offices, nested under a province.
            Referenced by <code>client_master_t.office_location_id</code>.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Office Location
        </button>
      </div>

      <DataTable<OfficeLocationRow>
        rows={items}
        loading={loading}
        rowKey={(o) => o.id}
        searchPlaceholder="Search location or province..."
        emptyMessage="No office locations yet — create the first one."
        columns={[
        { key: 'location_name', header: 'Office Location', sortable: true, className: 'font-medium' },
        { key: 'province_name', header: 'Province', className: 'text-slate-700', render: (o: OfficeLocationRow) => (
            <>
            {o.province_name ?? '—'}
            </>
          ) },
        { key: 'display', header: 'Status', render: (o: OfficeLocationRow) => (
            <>
            <span
                        className={
                          o.display === 'Y'
                            ? 'inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                            : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-muted-foreground'
                        }
                      >
                        {o.display === 'Y' ? 'Active' : 'Disabled'}
                      </span>
            </>
          ) },
        ]}
        actions={(o) => ({ edit: () => setEditing(o), remove: () => handleDelete(o.id) })}
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
        <OfficeLocationFormModal
          provinces={provinces}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The office location has been created.' });
          }}
        />
      )}

      {editing && (
        <OfficeLocationFormModal
          location={editing}
          provinces={provinces}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this office location have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function OfficeLocationFormModal({
  location,
  provinces,
  onClose,
  onSaved,
}: {
  location?: OfficeLocationRow;
  provinces: ProvinceOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!location;
  const [name, setName] = useState(location?.location_name || '');
  const [provinceId, setProvinceId] = useState(
    location?.province_id != null ? String(location.province_id) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise.
  const checkValue = isEdit && name === location?.location_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'office-locations',
    value: checkValue,
    excludeId: location?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/office-locations/${location!.id}`
      : '/api/v1/office-locations';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_name: name,
          province_id: provinceId === '' ? null : Number(provinceId),
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Office Location' : 'Create Office Location'}
          </h2>
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
            <label className="label required">Location Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={255}
              placeholder="e.g. Lubumbashi Branch"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
          </div>
          <div>
            <label className="label">Province</label>
            <SearchableSelect
              value={provinceId}
              emptyLabel="— None —"
              placeholder="— None —"
              options={provinces.map((p) => ({ value: String(p.id), label: p.province_name }))}
              onChange={setProvinceId}
            />
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
