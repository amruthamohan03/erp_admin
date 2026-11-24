'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Edit2, X, Check, FileText, Info } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { clientOptionLabel } from '@/lib/clientOptions';
import { formatDate } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import { NO_VALUE } from '@/lib/displayValue';

// Bivac / PARTIELLE Management, under Import License. The licence-level view of
// the PARTIELLE allotments Import Tracking creates (partial_t): each import
// licence (kind 1,2), what its allotments were given, and what the import and
// export files on them have used. Ported from the legacy /bivac; every figure is
// computed server-side (src/db/queries/bivac.ts, src/db/queries/partielle.ts).

interface LicenseRow {
  id: number;
  license_number: string | null;
  ref_cod: string | null;
  client_name: string | null;
  currency_name: string | null;
  type_of_goods_name: string | null;
  weight: number;
  fob_declared: number;
  insurance: number;
  freight: number;
  other_costs: number;
  partielle_count: number;
  total_allocated_weight: number;
  total_allocated_fob: number;
  total_used_weight: number;
  total_used_fob: number;
  balance_weight: number;
  balance_fob: number;
}

/** One allotment, as listForLicense returns it (src/db/queries/partielle.ts). */
interface PartialRow {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  weight_used: number;
  fob_used: number;
  remaining_weight: number;
  remaining_fob: number;
  no_of_files: number;
}

interface FileRow {
  key: string;
  side: 'Import' | 'Export';
  mca_ref: string | null;
  inspection_reports: string | null;
  declaration_reference: string | null;
  dgda_in_date: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  weight: number;
  fob: number;
}

/**
 * The editable allocation amounts — keys match the shared PARTIELLE API. An
 * allotment is budgeted in weight and FOB only, as Import Tracking cuts it.
 */
const AV_FIELDS = [
  ['partial_weight', 'AV Weight (KG)'],
  ['partial_fob', 'AV FOB'],
] as const;
type AvField = (typeof AV_FIELDS)[number][0];
type AvForm = Record<AvField, string>;

const HERO = 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700';

function fmt(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n ?? 0;
  return (Number.isFinite(v) ? (v as number) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** A count that opens a drill-down when there is something to open. */
function CountBadge({ count, onOpen, title }: { count: number; onOpen: () => void; title: string }) {
  if (count <= 0) {
    return (
      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
        0
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white ${HERO} hover:brightness-110`}
    >
      {count}
    </button>
  );
}

export default function BivacPage() {
  // ---- Licences table (server-side) ----
  const [items, setItems] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [clientOpts, setClientOpts] = useState<Array<{ id: number; short_name: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  // ---- Drill-downs ----
  const [viewLicense, setViewLicense] = useState<LicenseRow | null>(null);
  const [partials, setPartials] = useState<PartialRow[]>([]);
  const [partialsLoading, setPartialsLoading] = useState(false);

  const [viewPartial, setViewPartial] = useState<PartialRow | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // ---- Edit form ----
  const [edit, setEdit] = useState<PartialRow | null>(null);
  const [form, setForm] = useState<AvForm>({ partial_weight: '', partial_fob: '' });
  const [saving, setSaving] = useState(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  // The list's filter as query params, shared with its Excel export so the file
  // holds the rows the grid is showing (§4.15).
  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('q', search.trim());
    if (clientFilter) p.set('client_id', clientFilter);
    return p;
  }, [search, clientFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(filterParams);
      p.set('page', String(page));
      p.set('pageSize', String(pageSize));
      const res = await safeFetchJson<LicenseRow[]>(`/api/v1/bivac/licenses?${p}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(typeof res.meta?.total === 'number' ? res.meta.total : 0);
      } else {
        setItems([]);
        setTotal(0);
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
      }
    } finally {
      setLoading(false);
    }
  }, [filterParams, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    safeFetchJson<Array<{ id: number; short_name: string | null }>>('/api/v1/bivac/clients')
      .then((res) => { if (!cancelled && res.ok) setClientOpts(res.data); });
    return () => { cancelled = true; };
  }, []);

  async function openPartials(lic: LicenseRow) {
    setViewLicense(lic);
    setViewPartial(null);
    setFiles([]);
    setPartials([]);
    setPartialsLoading(true);
    try {
      const res = await safeFetchJson<PartialRow[]>(`/api/v1/bivac/licenses/${lic.id}/partials`);
      if (res.ok) setPartials(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setPartialsLoading(false);
    }
  }

  async function openFiles(p: PartialRow) {
    setViewPartial(p);
    setFiles([]);
    setFilesLoading(true);
    try {
      const res = await safeFetchJson<FileRow[]>(`/api/v1/bivac/partials/${p.id}/files`);
      if (res.ok) setFiles(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setFilesLoading(false);
    }
  }

  function openEdit(p: PartialRow) {
    setEdit(p);
    setInvalidField(null);
    setForm({ partial_weight: String(p.partial_weight), partial_fob: String(p.partial_fob) });
  }

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    setInvalidField(null);
    try {
      // The same guarded update Import Tracking uses — one set of budget rules.
      const res = await safeFetchJson(`/api/v1/partielles/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(AV_FIELDS.map(([key]) => [key, Number(form[key]) || 0])),
        ),
      });
      if (!res.ok) {
        // §4.22 — failure dismisses in place; the modal keeps the operator's input.
        setInvalidField(res.field ?? null);
        setResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
        return;
      }
      setResult({
        status: 'success',
        title: 'Saved',
        message: `The allocation for PARTIELLE ${edit.partial_name} has been updated.`,
      });
      setEdit(null);
      if (viewLicense) await openPartials(viewLicense);
      load();
    } finally {
      setSaving(false);
    }
  }

  // Rollups for the PARTIELLE summary bar.
  const totals = useMemo(() => {
    const t = { av_w: 0, av_f: 0, used_w: 0, used_f: 0, rem_w: 0, rem_f: 0, files: 0 };
    for (const p of partials) {
      t.av_w += p.partial_weight; t.av_f += p.partial_fob;
      t.used_w += p.weight_used; t.used_f += p.fob_used;
      t.rem_w += p.remaining_weight; t.rem_f += p.remaining_fob; t.files += p.no_of_files;
    }
    return t;
  }, [partials]);

  // Live edit calculations.
  const licW = edit && viewLicense ? viewLicense.weight : 0;
  const licF = edit && viewLicense ? viewLicense.fob_declared : 0;
  const avW = Number(form.partial_weight) || 0;
  const avF = Number(form.partial_fob) || 0;

  return (
    <>
      {/* Header */}
      <div className="card overflow-hidden mb-4">
        <div className={`h-1 w-full ${HERO}`} />
        <div className="p-5 flex items-center gap-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${HERO}`}>
            <Layers className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">PARTIELLE Management</h1>
            <p className="text-sm text-muted-foreground">Import-licence allocation and usage tracking (Bivac)</p>
          </div>
        </div>
      </div>

      {/* Licences */}
      <DataTable<LicenseRow>
        tableId="bivac-licenses"
        rows={items}
        loading={loading}
        rowKey={(l) => l.id}
        title="Import Licences"
        searchPlaceholder="Search licence, CRF, client, currency, goods type…"
        emptyMessage="No import licences match this filter — clear the search or pick another client."
        exportHref={`/api/v1/bivac/licenses/export?${filterParams}`}
        filters={
          <SearchableSelect
            size="sm"
            value={clientFilter}
            onChange={(v) => { setClientFilter(v); setPage(1); }}
            options={clientOpts.map((c) => ({ value: String(c.id), label: clientOptionLabel(c) }))}
            emptyLabel="All Clients"
            placeholder="All Clients"
            aria-label="Filter by client"
          />
        }
        columns={[
          { key: 'license_number', header: 'Licence #', className: 'font-mono text-xs font-medium' },
          { key: 'ref_cod', header: 'CRF', className: 'text-xs' },
          {
            key: 'partielle_count',
            header: 'PARTIELLE',
            align: 'center',
            render: (l) => (
              <CountBadge count={l.partielle_count} title="View PARTIELLE" onOpen={() => openPartials(l)} />
            ),
          },
          { key: 'client_name', header: 'Client', className: 'font-medium' },
          { key: 'currency_name', header: 'Currency', className: 'text-xs' },
          { key: 'type_of_goods_name', header: 'Type of Goods', className: 'text-xs' },
          { key: 'fob_declared', header: 'FOB', align: 'right', className: 'tabular-nums text-xs', render: (l) => fmt(l.fob_declared) },
          { key: 'freight', header: 'Freight', align: 'right', className: 'tabular-nums text-xs', render: (l) => fmt(l.freight) },
          { key: 'insurance', header: 'Insurance', align: 'right', className: 'tabular-nums text-xs', render: (l) => fmt(l.insurance) },
          { key: 'other_costs', header: 'Other', align: 'right', className: 'tabular-nums text-xs', render: (l) => fmt(l.other_costs) },
          { key: 'weight', header: 'Weight', align: 'right', className: 'tabular-nums text-xs', render: (l) => `${fmt(l.weight)} KG` },
          {
            key: 'balance_weight',
            header: 'Licence Wt − Used Wt',
            align: 'right',
            className: 'tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400',
            render: (l) => `${fmt(l.balance_weight)} KG`,
          },
          {
            key: 'balance_fob',
            header: 'Licence FOB − Used FOB',
            align: 'right',
            className: 'tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400',
            render: (l) => fmt(l.balance_fob),
          },
        ]}
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

      {/* ---- PARTIELLE drill-down ---- */}
      {viewLicense && (
        <div className="card overflow-hidden mt-5">
          <div className={`flex items-center justify-between px-4 py-3 text-white ${HERO}`}>
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" /> PARTIELLE for licence {viewLicense.license_number}
            </h2>
            <button
              type="button"
              onClick={() => { setViewLicense(null); setViewPartial(null); }}
              aria-label="Close PARTIELLE details"
              className="rounded-md p-1 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                ['CRF', viewLicense.ref_cod || NO_VALUE], ['Client', viewLicense.client_name || NO_VALUE],
                ['AV Wt', `${fmt(totals.av_w)} KG`], ['AV FOB', fmt(totals.av_f)],
                ['Used Wt', `${fmt(totals.used_w)} KG`], ['Used FOB', fmt(totals.used_f)],
                ['Rem Wt', `${fmt(totals.rem_w)} KG`], ['Rem FOB', fmt(totals.rem_f)],
                ['Licence Wt − Total AV Wt', `${fmt(viewLicense.weight - totals.av_w)} KG`],
                ['Licence FOB − Total AV FOB', fmt(viewLicense.fob_declared - totals.av_f)],
                ['Files', String(totals.files)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/50 px-3 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
                  <div className="text-sm font-bold text-foreground tabular-nums">{val}</div>
                </div>
              ))}
            </div>

            <DataTable<PartialRow>
              tableId="bivac-partielle"
              rows={partials}
              loading={partialsLoading}
              rowKey={(p) => p.id}
              searchPlaceholder="Search PARTIELLE name…"
              emptyMessage="No PARTIELLE for this licence yet — create them under Tracking Management → PARTIELLE Allocation."
              exportHref={`/api/v1/bivac/licenses/${viewLicense.id}/partials/export`}
              actions={(p) => ({ edit: () => openEdit(p) })}
              columns={[
                { key: 'partial_name', header: 'PARTIELLE', sortable: true, className: 'font-medium' },
                { key: 'partial_weight', header: 'AV Weight', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => `${fmt(p.partial_weight)} KG` },
                { key: 'partial_fob', header: 'AV FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => fmt(p.partial_fob) },
                { key: 'weight_used', header: 'Used Wt', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => `${fmt(p.weight_used)} KG` },
                { key: 'fob_used', header: 'Used FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => fmt(p.fob_used) },
                { key: 'remaining_weight', header: 'Remaining Wt', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => `${fmt(p.remaining_weight)} KG` },
                { key: 'remaining_fob', header: 'Remaining FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (p) => fmt(p.remaining_fob) },
                {
                  key: 'no_of_files',
                  header: 'Files',
                  align: 'center',
                  sortable: true,
                  render: (p) => <CountBadge count={p.no_of_files} title="View files" onOpen={() => openFiles(p)} />,
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* ---- Files drill-down ---- */}
      {viewPartial && (
        <div className="card overflow-hidden mt-5">
          <div className="flex items-center justify-between px-4 py-3 text-white bg-gradient-to-r from-amber-500 to-orange-600">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" /> Files for {viewPartial.partial_name}
            </h2>
            <button
              type="button"
              onClick={() => setViewPartial(null)}
              aria-label="Close files"
              className="rounded-md p-1 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                ['AV Weight', `${fmt(viewPartial.partial_weight)} KG`], ['AV FOB', fmt(viewPartial.partial_fob)],
                ['Used Weight', `${fmt(viewPartial.weight_used)} KG`], ['Used FOB', fmt(viewPartial.fob_used)],
                ['Remaining Weight', `${fmt(viewPartial.remaining_weight)} KG`], ['Remaining FOB', fmt(viewPartial.remaining_fob)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/50 px-3 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
                  <div className="text-sm font-bold text-foreground tabular-nums">{val}</div>
                </div>
              ))}
            </div>

            <DataTable<FileRow>
              tableId="bivac-files"
              rows={files}
              loading={filesLoading}
              rowKey={(f) => f.key}
              searchPlaceholder="Search file ref, declaration, liquidation, quittance…"
              emptyMessage="No import or export files use this PARTIELLE yet."
              exportHref={`/api/v1/bivac/partials/${viewPartial.id}/files/export`}
              columns={[
                { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
                { key: 'side', header: 'Side', sortable: true, className: 'text-xs' },
                { key: 'inspection_reports', header: 'Inspection', className: 'text-xs' },
                { key: 'declaration_reference', header: 'Declaration', className: 'text-xs' },
                { key: 'dgda_in_date', header: 'DGDA In', sortable: true, className: 'text-xs', render: (f) => formatDate(f.dgda_in_date) },
                { key: 'liquidation_reference', header: 'Liquidation Ref', className: 'text-xs' },
                { key: 'liquidation_date', header: 'Liquidation Date', sortable: true, className: 'text-xs', render: (f) => formatDate(f.liquidation_date) },
                { key: 'quittance_reference', header: 'Quittance Ref', className: 'text-xs' },
                { key: 'quittance_date', header: 'Quittance Date', sortable: true, className: 'text-xs', render: (f) => formatDate(f.quittance_date) },
                { key: 'weight', header: 'Weight', align: 'right', sortable: true, className: 'tabular-nums text-xs font-semibold', render: (f) => `${fmt(f.weight)} KG` },
                { key: 'fob', header: 'FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs font-semibold', render: (f) => fmt(f.fob) },
              ]}
            />
          </div>
        </div>
      )}

      {/* ---- Edit modal ---- */}
      {edit && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setEdit(null)}>
          <div className="card w-full max-w-2xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-violet-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Edit2 className="h-5 w-5" /> Edit allocation — {edit.partial_name}</h2>
              <button type="button" onClick={() => setEdit(null)} aria-label="Close" className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Only the <strong>AV Allocation</strong> amounts are editable. Used figures come from the import and export files on this PARTIELLE. An allocation cannot go below what is already used, and the licence&apos;s PARTIELLE together cannot exceed its FOB, or its weight where its Type of Goods limits weight.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {AV_FIELDS.map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`bivac-${key}`} className="label">{label}</label>
                    <input
                      id={`bivac-${key}`}
                      type="number" step="0.01" min="0" className="input"
                      aria-invalid={invalidField === key || undefined}
                      value={form[key]}
                      onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  ['Licence Weight', `${fmt(licW)} KG`], ['Licence FOB', fmt(licF)],
                  ['Used Weight', `${fmt(edit.weight_used)} KG`], ['Used FOB', fmt(edit.fob_used)],
                  ['Licence Wt − AV', `${fmt(licW - avW)} KG`], ['Licence FOB − AV', fmt(licF - avF)],
                  ['AV − Used Wt', `${fmt(avW - edit.weight_used)} KG`], ['AV − Used FOB', fmt(avF - edit.fob_used)],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
                    <div className="font-bold text-foreground tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setEdit(null)} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="btn-primary">
                <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
