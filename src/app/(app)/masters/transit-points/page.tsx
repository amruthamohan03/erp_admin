'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Anchor,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

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

type Capability =
  | 'entry_point'
  | 'exit_point'
  | 'loading'
  | 'destination'
  | 'warehouse'
  | 'location';

const CAPABILITIES: Array<{ key: Capability; label: string; short: string }> = [
  { key: 'entry_point', label: 'Entry Point', short: 'Entry' },
  { key: 'exit_point', label: 'Exit Point', short: 'Exit' },
  { key: 'loading', label: 'Loading', short: 'Load' },
  { key: 'destination', label: 'Destination', short: 'Dest' },
  { key: 'warehouse', label: 'Warehouse', short: 'WH' },
  { key: 'location', label: 'Generic Location', short: 'Loc' },
];

const CAPABILITY_FILTER_OPTIONS = [
  { value: '', label: 'All capabilities' },
  ...CAPABILITIES.map((c) => ({ value: c.key, label: `Has ${c.label}` })),
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
      alert(json.error?.message || 'Failed');
      return;
    }
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Anchor className="h-6 w-6 text-primary-600" />
            Transit Points
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Every customs touchpoint along a route — ports, border
            crossings, warehouses. Capability flags say which roles the
            point can play; imports / exports pickers filter by capability.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Transit Point
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search transit point..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input max-w-[200px]"
            value={capabilityFilter}
            onChange={(e) => {
              setCapabilityFilter(e.target.value);
              setPage(1);
            }}
          >
            {CAPABILITY_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Transit Point</th>
                {CAPABILITIES.map((c) => (
                  <th key={c.key} className="text-center text-xs">
                    {c.short}
                  </th>
                ))}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={CAPABILITIES.length + 3} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={CAPABILITIES.length + 3} className="text-center text-slate-500 py-8">
                    No transit points found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{t.transit_point_name}</td>
                    {CAPABILITIES.map((c) => (
                      <td key={c.key} className="text-center">
                        {t[c.key] ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
                        )}
                      </td>
                    ))}
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(t)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
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
          }}
        />
      )}
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
  const [flags, setFlags] = useState<Record<Capability, boolean>>(() => ({
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

  function toggleFlag(key: Capability, on: boolean) {
    setFlags((prev) => ({ ...prev, [key]: on }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
            <label className="label">Transit Point Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Port of Matadi"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
          </div>
          <div>
            <label className="label">Capabilities</label>
            <div className="grid grid-cols-2 gap-2">
              {CAPABILITIES.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    checked={flags[c.key]}
                    onChange={(e) => toggleFlag(c.key, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              imports / exports pickers filter to points with the matching
              capability — e.g. only points with <code>entry_point</code>
              are offered when filling in <code>entry_point_id</code>.
            </p>
          </div>
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
