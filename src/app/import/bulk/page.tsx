'use client';

// §4.9 — filter-driven bulk editor for Import Tracking. Pick a "pending/missing"
// filter, fill the exposed fields per row across pages, save once. The filter
// catalog, the rows, and the editable-field set all come from the server
// (master_bulk_filter_t) — nothing about which fields are editable is hardcoded
// here. Edits are keyed by row id so they survive paging/search until saved.
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';

interface FieldMeta { name: string; label: string; field_type: string }
interface FilterOpt { filter_key: string; label: string }
type Row = Record<string, unknown> & { id: number };

function asStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, 10).length === 10 && /^\d{4}-\d{2}-\d{2}/.test(String(v))
    ? String(v).slice(0, 10)
    : String(v);
}

export default function ImportBulkPage() {
  const [filters, setFilters] = useState<FilterOpt[]>([]);
  const [filterKey, setFilterKey] = useState('');
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // id → { field: value } pending edits, preserved across pages.
  const [edits, setEdits] = useState<Record<number, Record<string, unknown>>>({});

  useEffect(() => { setMounted(true); }, []);

  // Load the filter catalog once.
  useEffect(() => {
    fetch('/api/imports/bulk-edit')
      .then((r) => r.json())
      .then((j) => { if (j.success) setFilters(j.data.filters); })
      .catch(() => {});
  }, []);

  const loadRows = useCallback(async () => {
    if (!filterKey) { setItems([]); setFields([]); setTotal(0); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter: filterKey, page: String(page), pageSize: String(pageSize) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/imports/bulk-edit?${params.toString()}`);
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || 'Failed to load');
      setFields(j.data.fields);
      setItems(j.data.items);
      setTotal(j.data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterKey, page, pageSize, q]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  function setCell(id: number, field: string, value: unknown) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }
  function cellValue(row: Row, field: string): string {
    const edited = edits[row.id]?.[field];
    return asStr(edited !== undefined ? edited : row[field]);
  }

  async function save() {
    const updates = Object.entries(edits)
      .map(([id, vals]) => ({ id: Number(id), ...vals }))
      .filter((u) => Object.keys(u).length > 1);
    if (updates.length === 0) { setSavedMsg('No changes to save'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/imports/bulk-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: filterKey, updates }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || 'Save failed');
      setSavedMsg(`Updated ${j.data.updated} row(s)`);
      setEdits({});
      await loadRows();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const dirtyCount = Object.values(edits).filter((v) => Object.keys(v).length > 0).length;

  function inputType(t: string): string {
    if (t === 'date') return 'date';
    if (t === 'number') return 'number';
    return 'text';
  }

  return (
    <DashboardShell>
      <div className="mb-4">
        <BackButton fallback="/import" />
      </div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Bulk Update — Import Tracking</h1>
        {dirtyCount > 0 && (
          <span className="text-sm text-amber-600">{dirtyCount} row(s) edited</span>
        )}
      </div>

      <div className="card mb-4 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Filter</label>
          <select
            className="input w-64"
            value={filterKey}
            onChange={(e) => { setFilterKey(e.target.value); setPage(1); setEdits({}); }}
          >
            <option value="">— Select a filter —</option>
            {filters.map((f) => (
              <option key={f.filter_key} value={f.filter_key}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="Search MCA ref, client, horse, trailer, container…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
        </div>
        <button type="button" className="btn-primary" disabled={saving || !filterKey} onClick={save}>
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 mb-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}
      {savedMsg && !error && (
        <div className="rounded-md bg-emerald-50 p-3 mb-3 text-sm text-emerald-700 border border-emerald-200">{savedMsg}</div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">MCA Ref</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Pre-Alert</th>
                {fields.map((f) => (
                  <th key={f.name} className="px-3 py-2">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filterKey && (
                <tr><td colSpan={4 + fields.length} className="px-3 py-6 text-center text-slate-500">Select a filter to begin.</td></tr>
              )}
              {filterKey && loading && (
                <tr><td colSpan={4 + fields.length} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {filterKey && !loading && items.length === 0 && (
                <tr><td colSpan={4 + fields.length} className="px-3 py-6 text-center text-slate-500">No rows match this filter.</td></tr>
              )}
              {!loading && items.map((row, idx) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-500">{startIndex + idx + 1}</td>
                  <td className="px-3 py-2 font-medium">{asStr(row.mca_ref)}</td>
                  <td className="px-3 py-2">{asStr(row.client_name) || '—'}</td>
                  <td className="px-3 py-2">{asStr(row.pre_alert_date) || '—'}</td>
                  {fields.map((f) => (
                    <td key={f.name} className="px-3 py-2">
                      <input
                        type={inputType(f.field_type)}
                        className="input py-1"
                        value={cellValue(row, f.name)}
                        onChange={(e) => setCell(row.id, f.name, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
          totalRows={total}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>
    </DashboardShell>
  );
}
