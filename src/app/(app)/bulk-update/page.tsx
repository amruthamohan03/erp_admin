'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Database,
  Eye,
  Loader2,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

// Bulk-update operator UI. Single-page flow:
//   1. Pick entity (from /api/v1/bulk-update/targets)
//   2. Build filter — one or more (column, op, value) rows joined with AND
//   3. Click Preview → server returns matched_count
//   4. Pick patch field(s) + values
//   5. Click Apply → executes, audit row written
//
// Every step is reversible until Apply. The matched_count is the safety
// gate — operators see exactly how many rows will change.

type Op = 'eq' | 'neq' | 'isNull' | 'isNotNull' | 'in';

const OP_OPTIONS: Array<{ value: Op; label: string }> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
  { value: 'in', label: 'in (comma-separated)' },
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

interface PatchRow {
  _id: string;
  col: string;
  value: string;
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `r-${idSeq}`;
}

function coerceForOp(col: BulkColumn | undefined, op: Op, raw: string): unknown {
  if (op === 'isNull' || op === 'isNotNull') return undefined;
  if (op === 'in') {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (col?.type === 'number') return parts.map((p) => Number(p));
    return parts;
  }
  if (col?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (col?.type === 'boolean') {
    return raw === 'true' || raw === '1';
  }
  return raw;
}

function coerceForPatch(col: BulkColumn | undefined, raw: string): unknown {
  if (raw === '' && col?.type !== 'text') return null;
  if (col?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (col?.type === 'boolean') {
    return raw === 'true' || raw === '1';
  }
  return raw;
}

export default function BulkUpdatePage() {
  const [targets, setTargets] = React.useState<BulkTarget[]>([]);
  const [targetsError, setTargetsError] = React.useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = React.useState(true);

  const [entity, setEntity] = React.useState<string>('');
  const [filters, setFilters] = React.useState<FilterRow[]>([]);
  const [patches, setPatches] = React.useState<PatchRow[]>([]);

  const [matchedCount, setMatchedCount] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

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

  // Reset everything when the entity changes — column references are no
  // longer valid against the new whitelist.
  function changeEntity(v: string) {
    setEntity(v);
    setFilters([]);
    setPatches([]);
    setMatchedCount(null);
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
        op: 'eq',
        value: '',
      },
    ]);
    setMatchedCount(null);
  }
  function removeFilter(_id: string) {
    setFilters((prev) => prev.filter((f) => f._id !== _id));
    setMatchedCount(null);
  }
  function updateFilter(_id: string, patch: Partial<FilterRow>) {
    setFilters((prev) =>
      prev.map((f) => (f._id === _id ? { ...f, ...patch } : f)),
    );
    setMatchedCount(null);
  }

  function addPatch() {
    if (!selectedTarget) return;
    setPatches((prev) => [
      ...prev,
      {
        _id: nextId(),
        col: selectedTarget.editable_columns[0]?.name ?? '',
        value: '',
      },
    ]);
  }
  function removePatch(_id: string) {
    setPatches((prev) => prev.filter((p) => p._id !== _id));
  }
  function updatePatch(_id: string, patch: Partial<PatchRow>) {
    setPatches((prev) =>
      prev.map((p) => (p._id === _id ? { ...p, ...patch } : p)),
    );
  }

  function buildPredicate() {
    if (!selectedTarget || filters.length === 0) return null;
    const leaves = filters.map((f) => {
      const col = selectedTarget.filter_columns.find((c) => c.name === f.col);
      const value = coerceForOp(col, f.op, f.value);
      if (f.op === 'isNull' || f.op === 'isNotNull') {
        return { col: f.col, op: f.op };
      }
      return { col: f.col, op: f.op, value };
    });
    if (leaves.length === 1) return leaves[0];
    return { all: leaves };
  }

  function buildPatchPayload(): Record<string, unknown> | null {
    if (!selectedTarget || patches.length === 0) return null;
    const out: Record<string, unknown> = {};
    for (const p of patches) {
      const col = selectedTarget.editable_columns.find((c) => c.name === p.col);
      out[p.col] = coerceForPatch(col, p.value);
    }
    return out;
  }

  async function handlePreview() {
    if (!entity) return;
    const predicate = buildPredicate();
    if (!predicate) {
      setError('Add at least one filter row');
      return;
    }
    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/bulk-update/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, predicate }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Preview failed');
        return;
      }
      setMatchedCount(json.data.matched_count);
    } catch {
      setError('Network error');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!entity || matchedCount == null) return;
    const predicate = buildPredicate();
    const patch = buildPatchPayload();
    if (!predicate || !patch) {
      setError('Need at least one filter and one patch field');
      return;
    }
    if (
      !confirm(
        `Apply patch to ${matchedCount} row${matchedCount === 1 ? '' : 's'}?\n\n` +
          `This is irreversible. An audit row will be written.`,
      )
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/bulk-update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, predicate, patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Apply failed');
        return;
      }
      setNotice(
        `Applied — ${json.data.updated_count} of ${json.data.matched_count} rows updated.`,
      );
      // Stale preview after write — force a re-preview before next apply.
      setMatchedCount(null);
    } catch {
      setError('Network error');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="h-6 w-6 text-primary-600" />
            Bulk Update
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apply one or more field updates to every row matching a filter.
            Workflow-gated columns (e.g. <code>state</code>) are excluded by
            design — use the case-runtime transition endpoints for those.
          </p>
        </div>
      </div>

      {targetsError && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {targetsError}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
          {notice}
        </div>
      )}

      <div className="card p-6 mb-6">
        <label className="label">Entity</label>
        <div className="max-w-md">
          <SearchableSelect
            value={entity}
            onChange={changeEntity}
            options={targets.map((t) => ({ value: t.entity, label: t.label }))}
            placeholder={
              loadingTargets ? 'Loading...' : 'Pick an entity to bulk-update...'
            }
            emptyLabel="— Select an entity —"
          />
        </div>
      </div>

      {selectedTarget && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Filters (WHERE) */}
          <div className="card">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-medium">Filter rows</div>
                <div className="text-xs text-muted-foreground">
                  All conditions ANDed together. Allowed columns are
                  code-whitelisted.
                </div>
              </div>
              <button
                onClick={addFilter}
                className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/50 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add filter
              </button>
            </div>
            <div className="p-4 space-y-2">
              {filters.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No filters — add one to scope the update.
                </div>
              )}
              {filters.map((f) => {
                const col = selectedTarget.filter_columns.find(
                  (c) => c.name === f.col,
                );
                const opNeedsValue = f.op !== 'isNull' && f.op !== 'isNotNull';
                return (
                  <div key={f._id} className="flex items-center gap-2">
                    <SearchableSelect
                      className="flex-1 min-w-[120px]"
                      aria-label="Filter column"
                      value={f.col}
                      options={selectedTarget.filter_columns.map((c) => ({ value: c.name, label: c.label }))}
                      onChange={(v) => updateFilter(f._id, { col: v })}
                    />
                    <SearchableSelect
                      className="min-w-[120px]"
                      aria-label="Filter operator"
                      value={f.op}
                      options={OP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(v) => updateFilter(f._id, { op: v as Op })}
                    />
                    <input
                      className="input flex-1 min-w-[100px]"
                      type={
                        col?.type === 'date' && opNeedsValue && f.op !== 'in'
                          ? 'date'
                          : col?.type === 'number' && f.op !== 'in'
                            ? 'number'
                            : 'text'
                      }
                      value={f.value}
                      disabled={!opNeedsValue}
                      placeholder={
                        !opNeedsValue
                          ? '(no value needed)'
                          : f.op === 'in'
                            ? 'a, b, c'
                            : ''
                      }
                      onChange={(e) =>
                        updateFilter(f._id, { value: e.target.value })
                      }
                    />
                    <button
                      onClick={() => removeFilter(f._id)}
                      className="ico-delete"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={handlePreview}
                  disabled={previewing || filters.length === 0}
                  className="btn-secondary"
                >
                  {previewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  Preview
                </button>
                {matchedCount != null && (
                  <div className="text-sm">
                    <span className="font-semibold">{matchedCount}</span> row
                    {matchedCount === 1 ? '' : 's'} match.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Patch (SET) */}
          <div className="card">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-medium">Set fields</div>
                <div className="text-xs text-muted-foreground">
                  Editable columns are code-whitelisted. Empty value sets
                  NULL for non-text fields.
                </div>
              </div>
              <button
                onClick={addPatch}
                className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted/50 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add field
              </button>
            </div>
            <div className="p-4 space-y-2">
              {patches.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No fields — add one to define the patch.
                </div>
              )}
              {patches.map((p) => {
                const col = selectedTarget.editable_columns.find(
                  (c) => c.name === p.col,
                );
                return (
                  <div key={p._id} className="flex items-center gap-2">
                    <SearchableSelect
                      className="flex-1 min-w-[120px]"
                      aria-label="Column to update"
                      value={p.col}
                      options={selectedTarget.editable_columns.map((c) => ({ value: c.name, label: c.label }))}
                      onChange={(v) => updatePatch(p._id, { col: v })}
                    />
                    <input
                      className="input flex-1 min-w-[100px]"
                      type={
                        col?.type === 'date'
                          ? 'date'
                          : col?.type === 'number'
                            ? 'number'
                            : 'text'
                      }
                      value={p.value}
                      placeholder="new value"
                      onChange={(e) =>
                        updatePatch(p._id, { value: e.target.value })
                      }
                    />
                    <button
                      onClick={() => removePatch(p._id)}
                      className="ico-delete"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <div className="pt-2">
                <button
                  onClick={handleApply}
                  disabled={
                    applying ||
                    matchedCount == null ||
                    matchedCount === 0 ||
                    patches.length === 0
                  }
                  className="btn-primary"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Apply
                </button>
                {matchedCount == null && filters.length > 0 && (
                  <span className="ml-3 text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Run preview before applying.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
