'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Table2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import {
  GRIDS,
  GRID_COLUMNS,
  defaultAllHeadings,
  type AllGridHeadings,
  type GridKey,
} from '@/lib/invoiceGrid/columns';

// §4.1 — what the invoice grid's columns are CALLED.
//
// Not a DataTable (§4.25): this is not a list of records an operator searches
// and pages through — it is one header line per grid, edited in place, and the
// screen's whole job is to show that line as the grid draws it. A table of
// twenty-three rows would hide the thing being edited.
//
// One Save per grid, covering every column at once (§4.17's reasoning): an
// operator renaming three columns means one request and one transaction, never
// a half-renamed header line.

export default function InvoiceGridHeadingsPage() {
  const [grid, setGrid] = useState<GridKey>('import-cdf');
  const [all, setAll] = useState<AllGridHeadings>(defaultAllHeadings);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<AllGridHeadings>('/api/v1/invoice-grid-headings');
    if (res.ok) {
      setAll(res.data);
      setLoadError(null);
    } else {
      // The built-ins stay on screen — every column still has a name, which is
      // the right degradation for a label (§4.33's fallback rule).
      setLoadError(res.message || 'The column headings could not be loaded.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // The draft follows whichever grid is selected, and is reseeded whenever the
  // stored headings change, so Save always submits what is on screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({ ...all[grid] });
  }, [all, grid]);

  const columns = GRID_COLUMNS[grid];
  const dirty = columns.some((c) => (draft[c.key] ?? '') !== (all[grid]?.[c.key] ?? ''));

  async function save() {
    setSaving(true);
    const res = await safeFetchJson<AllGridHeadings>('/api/v1/invoice-grid-headings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grid_key: grid,
        headings: columns.map((c) => ({ column_key: c.key, heading: draft[c.key] ?? '' })),
      }),
    });
    setSaving(false);

    // §4.22 — a save always reports its outcome and the user acknowledges it.
    if (!res.ok) {
      setResult({
        status: 'error',
        title: 'Not saved',
        message: res.message || 'These column headings could not be saved.',
      });
      return;
    }
    setAll(res.data);
    setResult({
      status: 'success',
      title: 'Saved',
      message: 'The column headings have been updated. They apply to the grid and the printed invoice.',
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Invoice Grid Headings</h1>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}

      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        <Table2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          What each column is called in the invoice items grid, and on the printed invoice. An
          invoice draws one of these sets per category — the customs category in francs, the rest in
          dollars. Clearing a box restores the built-in name.
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-4 max-w-md">
          <label className="label">Grid</label>
          {/* §4.16 — pick-one is a SearchableSelect, never a raw select. */}
          <SearchableSelect
            value={grid}
            onChange={(v) => setGrid(v as GridKey)}
            options={GRIDS.map((g) => ({ value: g.key, label: g.name }))}
            aria-label="Grid"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {GRIDS.find((g) => g.key === grid)?.description}
          </p>
        </div>

        {/* The header line, shown as the grid draws it — left to right, in
            order — so an operator is editing what they can see. */}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-600 text-xs font-bold uppercase tracking-wide text-white">
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-1.5 text-left">
                    {draft[c.key]?.trim() || c.heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {columns.map((c) => (
                  <td key={c.key} className="border-t border-border p-2 align-top">
                    <input
                      className="input min-w-0"
                      value={draft[c.key] ?? ''}
                      onChange={(e) => setDraft((p) => ({ ...p, [c.key]: e.target.value }))}
                      placeholder={c.heading}
                      maxLength={60}
                      aria-label={`Heading for ${c.heading}`}
                      disabled={loading}
                    />
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{c.key}</p>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft(Object.fromEntries(columns.map((c) => [c.key, c.heading])))}
            className="btn-secondary btn-sm"
            title="Put the built-in names back in the boxes (not saved until you press Save)"
          >
            <RotateCcw className="h-4 w-4" /> Reset to built-in names
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || !dirty}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
