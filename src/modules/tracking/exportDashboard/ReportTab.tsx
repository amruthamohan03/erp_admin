'use client';

import { useState } from 'react';
import {
  Banknote, Calendar, CalendarCheck, DollarSign, FileDown, FileSpreadsheet, Info,
  Landmark, Receipt, Ship, Truck, UserCheck,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { EXPORT_DATE_FIELDS } from '@/lib/tracking/exportDateFields';
import { ChartCard, Group, TabError, TabSkeleton, accent } from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import { startDownload } from '../dashboardEndpoints';
import { exportDashboardExportSchema } from '@/schemas/export-dashboard';
import { summarizeZodError } from '@/lib/validation/messages';

// Report — the five agency reports and the custom export behind them.
//
// Each card states the date field it filters on, because that is what decides
// which files appear: the Quittance report filters on the quittance date, so a
// file that has not reached quittance is absent by definition rather than by
// accident. The filter above applies to every card AND to the sheet it
// produces, so a narrowed card can never hand back the whole book (§4.15).

type ReportData = { clients: Array<{ id: number; label: string }> };

const REPORT_CARDS = [
  { key: 'ogefrem', title: 'OGEFREM', filter: 'Loading Date', color: 'sky', icon: <Ship /> },
  { key: 'lmc', title: 'LMC', filter: 'Loading Date', color: 'violet', icon: <DollarSign /> },
  { key: 'ceec', title: 'CEEC & CEEG', filter: 'Loading Date', color: 'emerald', icon: <Landmark /> },
  { key: 'quittance', title: 'Quittance', filter: 'Quittance Date', color: 'amber', icon: <Receipt /> },
  { key: 'dispatch', title: 'Dispatch', filter: 'Dispatch Date', color: 'red', icon: <Truck /> },
] as const;

/** The first and last day of the current month, which the design pre-fills. */
function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return {
    from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))),
    to: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))),
  };
}

export default function ReportTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ReportData>(active ? tabEndpoint('report') : null);

  const bounds = monthBounds();
  const [client, setClient] = useState('');
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);

  const [customField, setCustomField] = useState<string>('created_at');
  const [customClient, setCustomClient] = useState('');
  const [customFrom, setCustomFrom] = useState(bounds.from);
  const [customTo, setCustomTo] = useState(bounds.to);

  const [result, setResult] = useState<SaveResult | null>(null);

  if (error) return <TabError message={error} />;

  const clientOptions = (data?.clients ?? []).map((c) => ({ value: String(c.id), label: c.label }));

  /**
   * Checked here with the same schema the route parses, so the wording an
   * operator sees does not depend on which side caught it (§4.23).
   */
  function run(payload: Record<string, string | undefined>): void {
    const parsed = exportDashboardExportSchema.safeParse(payload);
    if (!parsed.success) {
      setResult({ status: 'error', title: 'Not exported', message: summarizeZodError(parsed.error).message });
      return;
    }
    startDownload(exportHref(payload));
  }

  return (
    <div className="space-y-6">
      <Group
        title="Export Reports"
        hint="Choose a client and a date range, then pick the report to download"
        icon={<FileSpreadsheet className="h-4 w-4" />}
        accentColor="violet"
      >
        <div className="rounded-xl border border-border border-l-4 border-l-[#667eea] bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="label">
                <UserCheck className="mr-1 inline h-3.5 w-3.5" /> Client
              </label>
              <SearchableSelect
                value={client}
                onChange={setClient}
                options={clientOptions}
                emptyLabel="All Clients"
                placeholder="All Clients"
                aria-label="Client"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="label required" htmlFor="rpt-from">
                <Calendar className="mr-1 inline h-3.5 w-3.5" /> Start
              </label>
              <input id="rpt-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </div>
            <div className="min-w-[150px]">
              <label className="label required" htmlFor="rpt-to">
                <CalendarCheck className="mr-1 inline h-3.5 w-3.5" /> End
              </label>
              <input id="rpt-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
          </div>
        </div>
      </Group>

      {loading && !data ? (
        <TabSkeleton tiles={5} panels={1} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {REPORT_CARDS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                run({
                  scope: 'report',
                  report: c.key,
                  from: from || undefined,
                  to: to || undefined,
                  client_id: client || undefined,
                })
              }
              className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-6 text-center shadow-sm transition-transform hover:-translate-y-1.5 hover:shadow-lg"
              title={`Download the ${c.title} report for the chosen range`}
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: accent(c.color) }}
                aria-hidden="true"
              />
              <span
                className="mb-3 flex justify-center [&>svg]:h-9 [&>svg]:w-9"
                style={{ color: accent(c.color) }}
              >
                {c.icon}
              </span>
              <span className="text-base font-extrabold text-foreground">{c.title}</span>
              <span className="mt-1 text-[0.7rem] font-semibold text-muted-foreground">
                Filter: {c.filter}
              </span>
            </button>
          ))}
        </div>
      )}

      <ChartCard>
        <div className="mb-4 rounded-lg border border-border border-l-4 border-l-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
          <strong className="inline-flex items-center gap-1.5">
            <Info className="h-4 w-4" /> Custom Export by Date Field
          </strong>
          <span className="ms-2">
            Every tracked field, for files whose chosen date falls in the range.
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
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
            <label className="label required" htmlFor="cust-from">Start</label>
            <input id="cust-from" type="date" className="input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required />
          </div>
          <div className="min-w-[150px]">
            <label className="label required" htmlFor="cust-to">End</label>
            <input id="cust-to" type="date" className="input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} required />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label required">Filter By</label>
            <SearchableSelect
              value={customField}
              onChange={setCustomField}
              options={EXPORT_DATE_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
              placeholder="Choose a date field"
              aria-label="Date field"
            />
          </div>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() =>
              run({
                scope: 'custom',
                field: customField,
                from: customFrom || undefined,
                to: customTo || undefined,
                client_id: customClient || undefined,
              })
            }
          >
            <FileDown className="h-4 w-4" /> Export
          </button>
        </div>
      </ChartCard>

      <p className="text-xs text-muted-foreground">
        <Banknote className="mr-1 inline h-3 w-3" />
        The CEEC and Dispatch reports carry the same clearance trail and differ only in the date
        they filter on, so both are generated from one column set.
      </p>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}
