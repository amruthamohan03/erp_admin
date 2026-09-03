'use client';

// §8 Export Bulk Update — filter-scoped mass edit, the export twin of
// src/modules/imports/BulkUpdateModal.tsx.
//
// Opened from the /exports list when a "pending" status card is active; renders
// exactly the fields those filters are about (bulkFields.ts), plus read-only
// truck identity for the filters where the operator needs to know which truck
// they are dating. Only the rows left visible by the search box are submitted;
// the server validates and writes them in one transaction.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save, Search, X } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import { FIELD_META } from '@/lib/exports/bulkFields';
import { formatDate } from '@/lib/formatDate';

interface BulkData {
  relevant_fields: string[];
  readonly_fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface BulkExtraProps {
  client_id?: number;
  transport_mode_id?: number;
  loading_from?: string;
  loading_to?: string;
}

const inputType = (t: string | undefined): string =>
  t === 'date' ? 'date' : t === 'number' ? 'number' : 'text';

export default function BulkUpdateModal({
  statusFilters,
  extra,
  onClose,
  onSaved,
}: {
  statusFilters: string[];
  extra: BulkExtraProps;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BulkData | null>(null);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = new URLSearchParams({ status_filters: statusFilters.join(',') });
      if (extra.client_id) p.set('client_id', String(extra.client_id));
      if (extra.transport_mode_id) p.set('transport_mode_id', String(extra.transport_mode_id));
      if (extra.loading_from) p.set('loading_from', extra.loading_from);
      if (extra.loading_to) p.set('loading_to', extra.loading_to);
      const res = await safeFetchJson<BulkData>(`/api/v1/exports/bulk-update-data?${p}`);
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        // Seed the working copy from what is stored, so an operator sees the
        // current value and edits it rather than retyping a whole column.
        const seed: Record<number, Record<string, string>> = {};
        for (const row of res.data.rows) {
          const id = row.id as number;
          seed[id] = {};
          for (const f of res.data.relevant_fields) {
            const v = row[f];
            seed[id][f] = v === null || v === undefined ? '' : String(v);
          }
        }
        setEdits(seed);
      } else {
        setError(res.message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilters, extra]);

  const setCell = useCallback((id: number, field: string, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }, []);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    const hay = (row: Record<string, unknown>) =>
      ['mca_ref', 'client_name', 'horse', 'trailer_1', 'trailer_2', 'container']
        .map((k) => String(row[k] ?? '').toLowerCase())
        .join(' ');
    return data.rows.filter((r) => hay(r).includes(q));
  }, [data, search]);

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    const updates = visibleRows.map((r) => {
      const id = r.id as number;
      const values: Record<string, string> = {};
      for (const f of data.relevant_fields) values[f] = edits[id]?.[f] ?? '';
      return { id, values };
    });
    const res = await safeFetchJson<{ success_count: number }>('/api/v1/exports/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.data.success_count);
  }, [data, visibleRows, edits, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-6"
      onClick={onClose}
    >
      <div className="card my-auto w-full max-w-6xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4 text-white">
          <h2 className="font-semibold">
            Bulk Update — {statusFilters.length} filter{statusFilters.length === 1 ? '' : 's'}
          </h2>
          <button type="button" onClick={onClose} title="Close" className="rounded-md p-1 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input w-72 pl-9 text-sm"
              placeholder="Narrow: MCA, client, horse, trailer, container…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Narrow the rows to save"
            />
          </div>
          {/* Says plainly that the search box decides what gets written — narrowing
              is how an operator saves a subset, not just how they find a row. */}
          <span className="text-xs text-muted-foreground">
            {visibleRows.length} row{visibleRows.length === 1 ? '' : 's'} will be saved
          </span>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {data?.truncated && (
          <div className="mx-5 mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Showing the first 2000 matching exports — narrow the dashboard filters to edit the rest.
          </div>
        )}

        <div className="max-h-[68vh] overflow-auto p-5">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading rows…</div>
          ) : !data || data.relevant_fields.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No editable fields for the active filters — pick a “pending” status card first.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No matching exports.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base whitespace-nowrap text-xs">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>MCA Ref</th>
                    <th>Client</th>
                    <th>Loading Date</th>
                    {data.readonly_fields.map((f) => (
                      <th key={f}>{FIELD_META[f]?.label ?? f}</th>
                    ))}
                    {data.relevant_fields.map((f) => (
                      <th key={f}>{FIELD_META[f]?.label ?? f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => {
                    const id = row.id as number;
                    return (
                      <tr key={id} className="hover:bg-muted/50">
                        <td className="text-muted-foreground">{idx + 1}</td>
                        <td className="font-mono">{String(row.mca_ref ?? '—')}</td>
                        <td>{String(row.client_name ?? '—')}</td>
                        {/* §4.19 — read as DD-MM-YYYY; the date INPUTS below stay ISO,
                            which is what the control requires. */}
                        <td className="text-muted-foreground">{formatDate(row.loading_date)}</td>
                        {data.readonly_fields.map((f) => (
                          <td key={f} className="text-muted-foreground">{String(row[f] ?? '—')}</td>
                        ))}
                        {data.relevant_fields.map((f) => (
                          <td key={f}>
                            <input
                              type={inputType(FIELD_META[f]?.type)}
                              step={FIELD_META[f]?.type === 'number' ? '0.01' : undefined}
                              value={edits[id]?.[f] ?? ''}
                              onChange={(e) => setCell(id, f, e.target.value)}
                              className="input w-40 px-2 py-1 text-xs"
                              aria-label={`${FIELD_META[f]?.label ?? f} for ${String(row.mca_ref ?? id)}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* §4.21 — a labelled way out, in every mode. */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || visibleRows.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
}
