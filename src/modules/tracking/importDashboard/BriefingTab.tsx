'use client';

import { useMemo, useState } from 'react';
import { CalendarX, Check, ClipboardCheck, FileCheck2, Filter, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { formatDate } from '@/lib/formatDate';
import { IMPORT_DATE_FIELDS } from '@/lib/tracking/importDateFields';
import {
  ChartCard,
  Empty,
  ExportTile,
  KpiCard,
  SectionHeader,
  TabError,
  TabSkeleton,
  nf,
} from '../dashboardUi';
import BorderSection from './BorderSection';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { BriefingFile, ImportBriefing } from '@/db/queries/importDashboardTabs';

// Briefing — which dated milestones are still blank on files the operation has
// already cleared.
//
// A cleared file with holes in its date record cannot be audited or archived, so
// this is the list somebody works through before closing the month. The cards
// are the 25 tracked dates as counts; the matrix below is one column per date,
// ticked or crossed, filtered by the five pickers the design offers.
//
// The border section is rendered at the foot of this tab as well as on its own
// tab, which is how the uploaded design does it — a briefing operator needs the
// overstay list in the same pass.

/** The gradient cycled across the missing-date cards, as the design does. */
const CARD_COLORS = [
  'blue', 'cyan', 'sky', 'amber', 'lime', 'emerald', 'teal', 'violet',
  'fuchsia', 'green', 'orange', 'purple', 'indigo', 'rose', 'pink', 'slate', 'red',
];

/**
 * One milestone cell: present as a tick with its date, absent as a cross, and
 * a neutral dash where the date cannot apply to this file at all.
 *
 * The airport dates are never filled for a truck, so a cross against them is
 * not outstanding work — it is a column that does not belong to that row, and
 * marking every road file "incomplete" for it buries the real gaps.
 */
function DateCell({ value, applicable }: { value: string | null; applicable: boolean }) {
  if (!applicable) {
    return (
      <span className="text-xs text-muted-foreground" title="Does not apply to this transport mode">
        &ndash;
      </span>
    );
  }
  if (!value) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
        title="Not recorded"
      >
        <X className="h-3 w-3" />
        <span className="sr-only">Missing</span>
      </span>
    );
  }
  // The tick is the scannable form and the date is on hover: 25 date columns
  // rendered in full are 300 characters of row that nobody reads across.
  // §4.19 still governs the readable form, so the title is DD-MM-YYYY.
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
      title={formatDate(value)}
    >
      <Check className="h-3 w-3" />
      <span className="sr-only">{formatDate(value)}</span>
    </span>
  );
}

export default function BriefingTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ImportBriefing>(
    active ? tabEndpoint('briefing') : null,
  );

  const [transport, setTransport] = useState('');
  const [clearance, setClearance] = useState('');
  const [entryPoint, setEntryPoint] = useState('');
  const [goods, setGoods] = useState('');
  const [client, setClient] = useState('');

  // Memoised: a fresh [] on every render would re-run both memos below and
  // rebuild the filter option lists for nothing.
  const files = useMemo(() => data?.files ?? [], [data]);

  // The filter options are derived from the rows on screen rather than fetched:
  // an option that matches nothing in this scope would be a filter that empties
  // the table for no visible reason.
  const options = useMemo(() => {
    const uniq = (pick: (f: BriefingFile) => string | null): Array<{ value: string; label: string }> =>
      Array.from(new Set(files.map(pick).filter((v): v is string => !!v))).map((v) => ({
        value: v,
        label: v,
      }));
    return {
      transport: uniq((f) => f.transport_mode),
      clearance: uniq((f) => f.clearance_type),
      entryPoint: uniq((f) => f.entry_point),
      goods: uniq((f) => f.goods_type),
      client: uniq((f) => f.client_name),
    };
  }, [files]);

  const filtered = useMemo(
    () =>
      files.filter(
        (f) =>
          (!transport || f.transport_mode === transport) &&
          (!clearance || f.clearance_type === clearance) &&
          (!entryPoint || f.entry_point === entryPoint) &&
          (!goods || f.goods_type === goods) &&
          (!client || f.client_name === client),
      ),
    [files, transport, clearance, entryPoint, goods, client],
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={1} panels={2} /> : null;

  const anyFilter = !!(transport || clearance || entryPoint || goods || client);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:max-w-xs">
        <KpiCard
          value={nf.format(data.total)}
          label="Total Cleared Files"
          sub="Completed, cleared with IR and cleared with ARA"
          color="blue"
          icon={<FileCheck2 />}
        />
      </div>

      <SectionHeader title="Missing Dates Overview" icon={<CalendarX className="h-4 w-4" />} />
      {data.total === 0 ? (
        <ChartCard>
          <Empty>No files have been cleared yet, so there is nothing to brief on.</Empty>
        </ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {IMPORT_DATE_FIELDS.map((f, i) => {
            const count = data.missing[f.key] ?? 0;
            return (
              <ExportTile
                key={f.key}
                count={count}
                label={f.label}
                hint="missing"
                color={CARD_COLORS[i % CARD_COLORS.length]}
                // cleared_only, so the sheet holds exactly the files this card
                // counted rather than every file with the date blank.
                href={
                  count > 0
                    ? exportHref({ scope: 'missing', field: f.key, cleared_only: '1' })
                    : undefined
                }
                zeroLabel="all recorded"
              />
            );
          })}
        </div>
      )}

      {/* Filters — the design's own panel, with its left accent rule. */}
      <div className="rounded-xl border border-border border-l-4 border-l-[#667eea] bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h5 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <Filter className="h-4 w-4" /> Filters
          </h5>
          <a href={exportHref({ scope: 'briefing' })} className="btn-excel btn-sm">
            <ClipboardCheck className="h-4 w-4" /> Export to Excel
          </a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Client</label>
            <SearchableSelect value={client} onChange={setClient} options={options.client} emptyLabel="All" placeholder="All" aria-label="Client" />
          </div>
          <div>
            <label className="label">Transport</label>
            <SearchableSelect value={transport} onChange={setTransport} options={options.transport} emptyLabel="All" placeholder="All" aria-label="Transport mode" />
          </div>
          <div>
            <label className="label">Clearance</label>
            <SearchableSelect value={clearance} onChange={setClearance} options={options.clearance} emptyLabel="All" placeholder="All" aria-label="Clearance type" />
          </div>
          <div>
            <label className="label">Entry Point</label>
            <SearchableSelect value={entryPoint} onChange={setEntryPoint} options={options.entryPoint} emptyLabel="All" placeholder="All" aria-label="Entry point" />
          </div>
          <div>
            <label className="label">Type of Goods</label>
            <SearchableSelect value={goods} onChange={setGoods} options={options.goods} emptyLabel="All" placeholder="All" aria-label="Type of goods" />
          </div>
        </div>
        {anyFilter && (
          <p className="mt-3 text-xs font-medium text-primary-600">
            Showing {nf.format(filtered.length)} of {nf.format(files.length)} cleared files.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setClient('');
                setTransport('');
                setClearance('');
                setEntryPoint('');
                setGoods('');
              }}
            >
              Clear filters
            </button>
          </p>
        )}
      </div>

      <DataTable<BriefingFile>
        title="Clearing Completed Files — Date Status"
        rows={filtered}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search reference, client, entry point..."
        tableId="import-briefing"
        autoColumns={false}
        emptyMessage={
          files.length === 0
            ? 'No cleared files yet — nothing to brief on.'
            : 'No cleared files match these filters.'
        }
        columns={[
          { key: 'mca_ref', header: 'MCA Ref', sortable: true, render: (r) => <strong>{r.mca_ref ?? '—'}</strong> },
          { key: 'client_name', header: 'Client', sortable: true, render: (r) => r.client_name ?? '—' },
          { key: 'transport_mode', header: 'Transport', render: (r) => r.transport_mode ?? '—' },
          { key: 'clearance_type', header: 'Clearance', render: (r) => r.clearance_type ?? '—', defaultHidden: true },
          { key: 'entry_point', header: 'Entry Point', render: (r) => r.entry_point ?? '—' },
          { key: 'goods_type', header: 'Goods', render: (r) => r.goods_type ?? '—', defaultHidden: true },
          ...IMPORT_DATE_FIELDS.map((f) => ({
            key: f.key,
            header: f.short,
            align: 'center' as const,
            sortable: true,
            // The underlying ISO date is the sort and filter value, so a column
            // filter still matches a real date even though the cell shows a
            // tick (§4.25.1).
            value: (r: BriefingFile) => r.dates[f.key] ?? '',
            render: (r: BriefingFile) => (
              <DateCell
                value={r.dates[f.key] ?? null}
                applicable={!f.transportLetter || r.transport_letter === f.transportLetter}
              />
            ),
          })),
        ]}
        actions={(row) => ({ edit: `/imports/${row.id}` })}
      />

      {/* The border section, as the design places it: below a dashed rule at
          the foot of the briefing. */}
      <div className="mt-8 border-t-[3px] border-dashed border-border pt-6">
        <BorderSection active={active} title="Kasumbalesa Border Tracking" />
      </div>
    </div>
  );
}
