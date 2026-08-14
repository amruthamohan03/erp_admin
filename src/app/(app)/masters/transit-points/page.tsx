'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import Toggle from '@/components/ui/Toggle';

interface TransitPointRow {
  id: number;
  transit_point_name: string;
  entry_point: boolean;
  exit_point: boolean;
  loading: boolean;
  destination: boolean;
  warehouse: boolean;
  location: boolean;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

type FlagKey =
  | 'entry_point'
  | 'exit_point'
  | 'loading'
  | 'destination'
  | 'warehouse'
  | 'location';

const FLAGS: {
  key: FlagKey;
  label: string;
  short: string;
  badgeClass: string;
}[] = [
  { key: 'entry_point', label: 'Entry Point', short: 'ENT', badgeClass: 'bg-blue-100 text-blue-700' },
  { key: 'exit_point', label: 'Exit Point', short: 'EXT', badgeClass: 'bg-cyan-100 text-cyan-700' },
  { key: 'loading', label: 'Loading', short: 'LOAD', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { key: 'destination', label: 'Destination', short: 'DEST', badgeClass: 'bg-amber-100 text-amber-700' },
  { key: 'warehouse', label: 'Warehouse', short: 'WH', badgeClass: 'bg-violet-100 text-violet-700' },
  { key: 'location', label: 'Location', short: 'LOC', badgeClass: 'bg-rose-100 text-rose-700' },
];

export default function TransitPointsPage() {
  const [items, setItems] = useState<TransitPointRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TransitPointRow | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (capabilityFilter) params.set('capability', capabilityFilter);
      const res = await fetch(`/api/v1/transit-points?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, capabilityFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this transit point?')) return;
    const res = await fetch(`/api/v1/transit-points/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This transit point could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The transit point has been disabled.' });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Transit Points</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Transit Point
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search transit point name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <SearchableSelect
            className="max-w-[200px]"
            aria-label="Filter by flag"
            value={capabilityFilter}
            emptyLabel="All Flags"
            placeholder="All Flags"
            options={FLAGS.map((f) => ({ value: f.key, label: f.label }))}
            onChange={(v) => {
              setCapabilityFilter(v);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Transit Point</th>
                <th>Flags</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    No transit points found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{t.transit_point_name}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {FLAGS.filter((f) => t[f.key]).map((f) => (
                          <span
                            key={f.key}
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${f.badgeClass}`}
                          >
                            {f.short}
                          </span>
                        ))}
                        {FLAGS.every((f) => !t[f.key]) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(t)}
                        className="ico-edit"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="ico-delete ml-1"
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
          setPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          totalRows={total}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {showCreate && (
        <TransitPointFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The transit point has been created.' });
          }}
        />
      )}

      {editing && (
        <TransitPointFormModal
          point={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this transit point have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function TransitPointFormModal({
  point,
  onClose,
  onSaved,
}: {
  point?: TransitPointRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!point;
  const [name, setName] = useState(point?.transit_point_name || '');
  // Defaults match the schema (entry/exit/loading/destination = true;
  // warehouse/location = false) so a fresh create matches the DB shape.
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>(() => ({
    entry_point: point?.entry_point ?? true,
    exit_point: point?.exit_point ?? true,
    loading: point?.loading ?? true,
    destination: point?.destination ?? true,
    warehouse: point?.warehouse ?? false,
    location: point?.location ?? false,
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === point?.transit_point_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'transit-points',
    value: checkValue,
    excludeId: point?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/transit-points/${point!.id}`
      : '/api/v1/transit-points';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = {
      transit_point_name: name,
      ...flags,
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Transit Point' : 'Create Transit Point'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Transit Point Name</label>
            <input
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              maxLength={255}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div>
            <label className="label">Flags</label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {FLAGS.map((f) => (
                <Toggle
                  key={f.key}
                  checked={flags[f.key]}
                  onChange={(v) =>
                    setFlags((prev) => ({ ...prev, [f.key]: v }))
                  }
                  label={f.label}
                />
              ))}
            </div>
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
