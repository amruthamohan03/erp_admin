'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Banknote,
  Building,
  CalendarClock,
  Coins,
  DoorOpen,
  FileCheck2,
  FileDigit,
  FileDown,
  FileX2,
  FileText,
  Filter,
  Flag,
  GitBranch,
  Info,
  LogIn,
  LogOut,
  MapPin,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import {
  IMPORT_DATE_FIELDS,
  IMPORT_MISSING_CARD_FIELDS,
  IMPORT_PIPELINE_STEPS,
} from '@/lib/tracking/importDateFields';
import {
  ChartCard,
  ExportTile,
  SectionHeader,
  TabError,
  TabSkeleton,
  nf,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import { startDownload } from '../dashboardEndpoints';
import { importDashboardExportSchema } from '@/schemas/import-dashboard';
import { summarizeZodError } from '@/lib/validation/messages';
import type { ImportReportCounts } from '@/db/queries/importDashboardTabs';

// Reports — every "which files are missing X" count, as a card that downloads
// exactly what it counted.
//
// The counts and the downloads share one filter: whatever client and date range
// are set above apply to the figure on the card AND to the spreadsheet it
// produces, so a filtered card can never hand back the unfiltered book (§4.15).

type ReportData = ImportReportCounts & { clients: Array<{ id: number; label: string }> };

/** The design's per-field hue and glyph, in its own order. */
const CARD_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  arrival_date_zambia: { color: 'sky', icon: <PlaneLanding /> },
  dispatch_from_zambia: { color: 'amber', icon: <PlaneTakeoff /> },
  drc_entry_date: { color: 'lime', icon: <Flag /> },
  border_warehouse_arrival_date: { color: 'emerald', icon: <Warehouse /> },
  dispatch_from_border: { color: 'teal', icon: <Send /> },
  kanyaka_arrival_date: { color: 'violet', icon: <MapPin /> },
  kanyaka_dispatch_date: { color: 'fuchsia', icon: <ArrowRight /> },
  warehouse_arrival_date: { color: 'green', icon: <Store /> },
  warehouse_departure_date: { color: 'orange', icon: <DoorOpen /> },
  dispatch_deliver_date: { color: 'purple', icon: <Truck /> },
  airport_arrival_date: { color: 'sky', icon: <Plane /> },
  dispatch_from_airport: { color: 'indigo', icon: <Plane /> },
  dgda_in_date: { color: 'rose', icon: <LogIn /> },
  dgda_out_date: { color: 'emerald', icon: <LogOut /> },
  customs_manifest_date: { color: 'amber', icon: <FileDigit /> },
  segues_payment_date: { color: 'green', icon: <Banknote /> },
  ad_date: { color: 'violet', icon: <ShieldCheck /> },
  insurance_date: { color: 'blue', icon: <ShieldCheck /> },
  crf_received_date: { color: 'cyan', icon: <Receipt /> },
  liquidation_date: { color: 'orange', icon: <Coins /> },
  quittance_date: { color: 'lime', icon: <Banknote /> },
  t1_date: { color: 'fuchsia', icon: <FileText /> },
  audited_date: { color: 'purple', icon: <FileCheck2 /> },
  archived_date: { color: 'slate', icon: <Archive /> },
  pre_alert_date: { color: 'blue', icon: <CalendarClock /> },
};

const PIPELINE_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  declaration_missing: { color: 'rose', icon: <FileX2 /> },
  liquidation_missing: { color: 'amber', icon: <Coins /> },
  quittance_missing: { color: 'violet', icon: <Banknote /> },
};

export default function ReportsTab({ active }: { active: boolean }) {
  // Applied filters, separate from what is typed: the counts refetch when the
  // operator applies them, not on every keystroke in a date input.
  const [draft, setDraft] = useState({ client_id: '', from: '', to: '' });
  const [applied, setApplied] = useState({ client_id: '', from: '', to: '' });

  const { data, loading, error } = useTabData<ReportData>(
    active
      ? tabEndpoint('reports', {
          client_id: applied.client_id || undefined,
          from: applied.from || undefined,
          to: applied.to || undefined,
        })
      : null,
  );

  // The custom export: a date field plus a range, which is the inverse of a
  // missing-date card — files where that date IS set and falls in the range.
  const [customField, setCustomField] = useState<string>(IMPORT_DATE_FIELDS[0].key);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customClient, setCustomClient] = useState('');
  const [result, setResult] = useState<SaveResult | null>(null);

  const filterArgs = useMemo(
    () => ({
      client_id: applied.client_id || undefined,
      from: applied.from || undefined,
      to: applied.to || undefined,
    }),
    [applied],
  );

  const filterActive = !!(applied.client_id || applied.from || applied.to);

  function runCustomExport(): void {
    const payload = {
      scope: 'custom' as const,
      field: customField,
      from: customFrom || undefined,
      to: customTo || undefined,
      client_id: customClient || undefined,
    };
    // Checked here with the same schema the route parses, so the wording an
    // operator sees does not depend on which side caught it (§4.23).
    const parsed = importDashboardExportSchema.safeParse(payload);
    if (!parsed.success) {
      const { message } = summarizeZodError(parsed.error);
      setResult({ status: 'error', title: 'Not exported', message });
      return;
    }
    startDownload(exportHref(payload));
  }

  if (error) return <TabError message={error} />;

  const clientOptions = (data?.clients ?? []).map((c) => ({
    value: String(c.id),
    label: c.label,
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border border-l-4 border-l-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <strong className="inline-flex items-center gap-1.5">
          <Info className="h-4 w-4" /> Quick Export by Date Field
        </strong>{' '}
        — click any card to export the records it counts.
      </div>

      {/* Filter — the design's panel with its left accent rule. */}
      <div className="rounded-xl border border-border border-l-4 border-l-[#667eea] bg-card p-5 shadow-sm">
        <h5 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-foreground">
          <Filter className="h-4 w-4" /> Filter
        </h5>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="label">Client</label>
            <SearchableSelect
              value={draft.client_id}
              onChange={(v) => setDraft((d) => ({ ...d, client_id: v }))}
              options={clientOptions}
              emptyLabel="All Clients"
              placeholder="All Clients"
              aria-label="Client"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="label" htmlFor="rpt-from">
              Start Date
            </label>
            <input
              id="rpt-from"
              type="date"
              className="input"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </div>
          <div className="min-w-[150px]">
            <label className="label" htmlFor="rpt-to">
              End Date
            </label>
            <input
              id="rpt-to"
              type="date"
              className="input"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </div>
          <button type="button" className="btn-primary btn-sm" onClick={() => setApplied(draft)}>
            <Filter className="h-4 w-4" /> Apply
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              const cleared = { client_id: '', from: '', to: '' };
              setDraft(cleared);
              setApplied(cleared);
            }}
          >
            <X className="h-4 w-4" /> Clear
          </button>
        </div>
        {filterActive && (
          <p className="mt-3 text-xs font-semibold text-primary-600">
            Counts and exports are narrowed to
            {applied.client_id
              ? ` ${clientOptions.find((c) => c.value === applied.client_id)?.label ?? 'one client'}`
              : ' all clients'}
            {applied.from || applied.to
              ? `, files created ${applied.from || 'any time'} to ${applied.to || 'now'}`
              : ''}
            .
          </p>
        )}
      </div>

      {!data ? (
        loading ? (
          <TabSkeleton tiles={3} panels={2} />
        ) : null
      ) : (
        <>
          <SectionHeader title="Clearance Pipeline" icon={<GitBranch className="h-4 w-4" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {IMPORT_PIPELINE_STEPS.map((s, i) => {
              const count = data.pipeline[s.key] ?? 0;
              const style = PIPELINE_STYLE[s.key];
              return (
                <ExportTile
                  key={s.key}
                  count={count}
                  label={`Step ${i + 1} — ${s.label}`}
                  hint={s.hint}
                  color={style.color}
                  icon={style.icon}
                  href={count > 0 ? exportHref({ scope: 'pipeline', step: s.key, ...filterArgs }) : undefined}
                  zeroLabel="nothing outstanding"
                />
              );
            })}
          </div>

          <SectionHeader title="Export by Date Field" icon={<CalendarClock className="h-4 w-4" />} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {IMPORT_MISSING_CARD_FIELDS.map((f) => {
              const count = data.missing[f.key] ?? 0;
              const style = CARD_STYLE[f.key] ?? { color: 'blue', icon: <CalendarClock /> };
              return (
                <ExportTile
                  key={f.key}
                  count={count}
                  label={f.label}
                  hint={f.transportLetter === 'A' ? 'missing — air only' : 'missing records'}
                  color={style.color}
                  icon={style.icon}
                  href={count > 0 ? exportHref({ scope: 'missing', field: f.key, ...filterArgs }) : undefined}
                  zeroLabel="all recorded"
                />
              );
            })}
          </div>

          <ChartCard title="Advanced Custom Export" icon={<Settings className="h-4 w-4" />}>
            <p className="mb-4 text-sm text-muted-foreground">
              The inverse of a card above: files where the chosen date IS recorded and falls in the
              range.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="label">Client</label>
                <SearchableSelect
                  value={customClient}
                  onChange={setCustomClient}
                  options={clientOptions}
                  emptyLabel="All Clients"
                  placeholder="All Clients"
                  aria-label="Client for the custom export"
                />
              </div>
              <div className="min-w-[150px]">
                <label className="label required" htmlFor="cust-from">
                  Start
                </label>
                <input
                  id="cust-from"
                  type="date"
                  className="input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-[150px]">
                <label className="label required" htmlFor="cust-to">
                  End
                </label>
                <input
                  id="cust-to"
                  type="date"
                  className="input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="label required">Date Field</label>
                <SearchableSelect
                  value={customField}
                  onChange={setCustomField}
                  options={IMPORT_DATE_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
                  placeholder="Choose a date field"
                  aria-label="Date field"
                />
              </div>
              <button type="button" className="btn-primary btn-sm" onClick={runCustomExport}>
                <FileDown className="h-4 w-4" /> Export
              </button>
            </div>
          </ChartCard>

          <p className="text-xs text-muted-foreground">
            <Building className="mr-1 inline h-3 w-3" />
            Every sheet carries all {nf.format(91)} fields of the Import form, so a field added to
            the form appears in these exports with no change here.
          </p>
        </>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}
