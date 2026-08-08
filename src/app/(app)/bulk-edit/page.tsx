'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Database,
  Eye,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';

// /bulk-edit — per-row bulk editor. Distinct from /bulk-update
// (which sets ONE value across many rows). Here every matching row
// gets its own inputs; pending edits persist across page changes
// keyed by row id so an operator can jump around before saving.
//
// Flow:
//   1. Pick entity (reuses /api/v1/bulk-update/targets)
//   2. Build filter — one or more (column, op, value) rows joined AND
//   3. Load rows → editable grid appears
//   4. Type per-row edits — held in edits[id][col] map
//   5. Save → posts every non-empty edit; audit + tx server-side

type Op = 'eq' | 'neq' | 'isNull' | 'isNotNull' | 'in';

const OP_OPTIONS: Array<{ value: Op; label: string }> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
  { value: 'in', label: 'in (comma-sep)' },
];

interface BulkColumn {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
}
interface BulkTarget {
  entity: string;
  label: string;
  editable_columns: BulkColumn[];
  filter_columns: BulkColumn[];
}
interface FilterRow {
  _id: string;
  col: string;
  op: Op;
  value: string;
}

let idSeq = 0;
const nextId = (): string => `r-${(idSeq += 1)}`;

function coerceForOp(col: BulkColumn | undefined, op: Op, raw: string): unknown {
  if (op === 'isNull' || op === 'isNotNull') return undefined;
  if (op === 'in') {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (col?.type === 'number') return parts.map((p) => Number(p));
    return parts;
  }
  if (col?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (col?.type === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

function coerceForPatch(col: BulkColumn | undefined, raw: string): unknown {
  if (raw === '' && col?.type !== 'text') return null;
  if (col?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (col?.type === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

// Coerce a value back to a display string for the editable input.
function toInputString(v: unknown, col: BulkColumn): string {
  if (v == null) return '';
  if (col.type === 'date' && typeof v === 'string') {
    // API returns ISO timestamps for dates; the <input type=date> needs YYYY-MM-DD.
    return v.slice(0, 10);
  }
  return String(v);
}

interface RowsPayload {
  entity: string;
  table: string;
  total: number;
  page: number;
  pageSize: number;
  editable_columns: BulkColumn[];
  rows: Array<Record<string, unknown>>;
}

export default function BulkEditPage() {
  const [targets, setTargets] = React.useState<BulkTarget[]>([]);
  const [targetsError, setTargetsError] = React.useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = React.useState(true);

  const [entity, setEntity] = React.useState<string>('');
  const [filters, setFilters] = React.useState<FilterRow[]>([]);

  const [rowsPayload, setRowsPayload] = React.useState<RowsPayload | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [loadingRows, setLoadingRows] = React.useState(false);

  // Pending edits — id → column → value. Preserved across page changes.
  const [edits, setEdits] = React.useState<
    Record<number, Record<string, string>>
  >({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/bulk-update/targets');
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) setTargets(json.data);
        else setTargetsError(json.error?.message ?? 'Failed to load targets');
      } catch {
        if (!cancelled) setTargetsError('Network error');
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTarget = React.useMemo(
    () => targets.find((t) => t.entity === entity),
    [targets, entity],
  );

  function resetOnEntityChange(v: string) {
    setEntity(v);
    setFilters([]);
    setRowsPayload(null);
    setEdits({});
    setPage(1);
    setError(null);
    setNotice(null);
  }

  function addFilter() {
    if (!selectedTarget) return;
    setFilters((prev) => [
      ...prev,
      {
        _id: nextId(),
        col: selectedTarget.filter_columns[0]?.name ?? '',
        op: 'isNull',
        value: '',
      },
    ]);
    setRowsPayload(null);
  }
  const removeFilter = (id: string): void => {
    setFilters((prev) => prev.filter((f) => f._id !== id));
    setRowsPayload(null);
  };
  const updateFilter = (id: string, patch: Partial<FilterRow>): void => {
    setFilters((prev) => prev.map((f) => (f._id === id ? { ...f, ...patch } : f)));
    setRowsPayload(null);
  };

  function buildPredicate() {
    if (!selectedTarget || filters.length === 0) return null;
    const leaves = filters.map((f) => {
      const col = selectedTarget.filter_columns.find((c) => c.name === f.col);
      if (f.op === 'isNull' || f.op === 'isNotNull') {
        return { col: f.col, op: f.op };
      }
      return { col: f.col, op: f.op, value: coerceForOp(col, f.op, f.value) };
    });
    return leaves.length === 1 ? leaves[0] : { all: leaves };
  }

  async function loadRows(p = page, ps = pageSize) {
    if (!entity) return;
    const predicate = buildPredicate();
    if (!predicate) {
      setError('Add at least one filter row');
      return;
    }
    setError(null);
    setNotice(null);
    setLoadingRows(true);
    try {
      const res = await fetch('/api/v1/bulk-edit/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, predicate, page: p, pageSize: ps }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Load failed');
        return;
      }
      setRowsPayload(json.data as RowsPayload);
    } catch {
      setError('Network error');
    } finally {
      setLoadingRows(false);
    }
  }

  function editCell(id: number, col: string, value: string) {
    setEdits((prev) => {
      const rowEdits = { ...(prev[id] ?? {}) };
      rowEdits[col] = value;
      return { ...prev, [id]: rowEdits };
    });
  }

  async function save() {
    if (!entity) return;
    const rowIds = Object.keys(edits).map(Number);
    if (rowIds.length === 0) {
      setNotice('Nothing to save.');
      return;
    }

    // Build the API payload — every edited row becomes { id, patch }.
    // Empty strings on non-text fields coerce to null; empty strings on
    // text fields become empty strings.
    const cols = selectedTarget?.editable_columns ?? [];
    const payload = rowIds
      .map((id) => {
        const rowEdits = edits[id] ?? {};
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rowEdits)) {
          patch[k] = coerceForPatch(
            cols.find((c) => c.name === k),
            v,
          );
        }
        return { id, patch };
      })
      .filter((e) => Object.keys(e.patch).length > 0);

    if (payload.length === 0) {
      setNotice('Nothing to save.');
      return;
    }

    if (
      !confirm(
        `Save edits to ${payload.length} row${payload.length === 1 ? '' : 's'}?\n\n` +
          `An audit row will be written.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/bulk-edit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, edits: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Save failed');
        return;
      }
      setNotice(
        `Saved — ${json.data.updated_count} of ${json.data.requested_count} rows updated.`,
      );
      setEdits({});
      await loadRows(page, pageSize);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  const totalRows = rowsPayload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startIndex = (page - 1) * pageSize;
  const editedCount = Object.keys(edits).length;

  if (loadingTargets) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-20 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading targets…
      </div>
    );
  }
  if (targetsError) {
    return (
      <div className="card p-6 text-sm text-red-700">{targetsError}</div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="h-6 w-6 text-primary-600" />
          Bulk edit (per row)
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
          {notice}
        </div>
      )}

      <section className="card p-4 mb-4">
        <label className="label required">Entity</label>
        <SearchableSelect required
          value={entity}
          onChange={resetOnEntityChange}
          options={targets.map((t) => ({ value: t.entity, label: t.label }))}
          placeholder="Pick an entity..."
          emptyLabel="—"
        />
      </section>

      {selectedTarget && (
        <section className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700">
              Filter — join with AND
            </h2>
            <button
              type="button"
              onClick={addFilter}
              className="btn-secondary text-xs"
            >
              <Plus className="h-3 w-3" /> Add filter
            </button>
          </div>
          {filters.length === 0 && (
            <p className="text-xs text-slate-500">
              No filters — add one to narrow which rows load.
            </p>
          )}
          <div className="space-y-2">
            {filters.map((f) => {
              const col = selectedTarget.filter_columns.find(
                (c) => c.name === f.col,
              );
              const noValue = f.op === 'isNull' || f.op === 'isNotNull';
              return (
                <div key={f._id} className="grid grid-cols-12 gap-2">
                  <SearchableSelect
                    className="col-span-4"
                    size="sm"
                    aria-label="Filter column"
                    value={f.col}
                    options={selectedTarget.filter_columns.map((c) => ({
                      value: c.name,
                      label: `${c.label} (${c.name})`,
                    }))}
                    onChange={(v) => updateFilter(f._id, { col: v })}
                  />
                  <SearchableSelect
                    className="col-span-3"
                    size="sm"
                    aria-label="Filter operator"
                    value={f.op}
                    options={OP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    onChange={(v) => updateFilter(f._id, { op: v as Op })}
                  />
                  <input
                    className="input col-span-4 text-sm"
                    value={f.value}
                    disabled={noValue}
                    placeholder={noValue ? '(no value)' : `${col?.type ?? ''}...`}
                    onChange={(e) =>
                      updateFilter(f._id, { value: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeFilter(f._id)}
                    className="text-slate-400 hover:text-red-600 p-1 col-span-1 justify-self-end"
                    title="Remove filter"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPage(1);
                loadRows(1, pageSize);
              }}
              disabled={loadingRows || filters.length === 0}
            >
              {loadingRows ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Load rows
            </button>
          </div>
        </section>
      )}

      {rowsPayload && selectedTarget && (
        <section className="card">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">
                {rowsPayload.total.toLocaleString()}
              </span>{' '}
              matching row{rowsPayload.total === 1 ? '' : 's'}
              {editedCount > 0 && (
                <span className="ml-2 text-amber-700">
                  · {editedCount} pending edit{editedCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || editedCount === 0}
              onClick={save}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save {editedCount || ''} edit{editedCount === 1 ? '' : 's'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>ID</th>
                  {selectedTarget.editable_columns.map((c) => (
                    <th key={c.name}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsPayload.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={2 + selectedTarget.editable_columns.length}
                      className="text-center text-slate-500 py-8"
                    >
                      No matching rows.
                    </td>
                  </tr>
                )}
                {rowsPayload.rows.map((row, idx) => {
                  const id = Number(row.id);
                  const rowEdits = edits[id] ?? {};
                  return (
                    <tr key={id} className="hover:bg-slate-50">
                      <td className="text-slate-500 text-xs">
                        {startIndex + idx + 1}
                      </td>
                      <td className="font-mono text-xs text-slate-700">
                        #{id}
                      </td>
                      {selectedTarget.editable_columns.map((c) => {
                        const current =
                          rowEdits[c.name] ?? toInputString(row[c.name], c);
                        const isDate = c.type === 'date';
                        const isNum = c.type === 'number';
                        return (
                          <td key={c.name}>
                            <input
                              type={isDate ? 'date' : isNum ? 'number' : 'text'}
                              className="input text-xs w-40"
                              value={current}
                              onChange={(e) =>
                                editCell(id, c.name, e.target.value)
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            page={page}
            setPage={(p) => {
              setPage(p);
              loadRows(p, pageSize);
            }}
            pageSize={pageSize}
            setPageSize={(n) => {
              setPageSize(n);
              setPage(1);
              loadRows(1, n);
            }}
            totalRows={totalRows}
            totalPages={totalPages}
            startIndex={startIndex}
            mounted={mounted}
          />
        </section>
      )}
    </>
  );
}
