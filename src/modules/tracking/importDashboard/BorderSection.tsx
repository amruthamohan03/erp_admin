'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CircleCheck,
  Clock,
  ClockAlert,
  FileSpreadsheet,
  Import,
  Info,
  LayoutGrid,
  Settings2,
  Truck,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/formatDate';
import {
  ChartCard,
  Empty,
  KpiCard,
  SectionHeader,
  SummaryAlert,
  TabError,
  TabSkeleton,
  nf,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { BorderFile, ImportBorder } from '@/db/queries/importDashboardTabs';
import type { RemarkLine } from '@/db/schema/imports';

// The border overstay section — trucks sitting at a DRC border post longer than
// the agreed allowance.
//
// ONE component, rendered by both the Briefing tab and the Kasumbalesa tab,
// exactly as the uploaded design shares `renderKasumbalesaContent` between the
// same two places (§4.10). Each instance fetches on its own, so visiting both
// tabs costs two requests — the alternative is hoisting this tab's data into a
// parent that most sessions never need.
//
// Both halves of the rule are configuration (§4.1): which posts it applies at
// is the `border_post` flag on the transit-point master, and how many working
// days each allows is that post's own column. Main hardcoded the posts as
// `entry_point_id IN (8, 9, 10)` and the limit as a literal 3 in two places.
//
// The delay is computed server-side by `classifyBorderDelay`, so the screen,
// the overstay export and any later report read one answer — and a file with no
// dispatch date is measured against today, which is the point: an overstaying
// truck must show as overstaying NOW.

/** The dated remarks log, flattened to one readable line (§4.5, §4.19). */
function remarksText(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';
  return (raw as RemarkLine[])
    .map((r) => [r.date ? formatDate(r.date) : '', r.remark].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' | ');
}

/** The delay reading: days against the allowance, coloured by the outcome. */
function DelayCell({ file }: { file: BorderFile }) {
  const { outcome, working_days, limit, still_waiting } = file.delay;
  if (outcome === 'unmeasured') {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="No DRC Entry date recorded, so the wait cannot be measured"
      >
        —
      </span>
    );
  }
  const delayed = outcome === 'delayed';
  return (
    <span
      className={
        delayed
          ? 'inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
          : 'inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
      }
      title={`${working_days} working day${working_days === 1 ? '' : 's'} of ${limit} allowed${
        still_waiting ? ', and still at the border' : ''
      }`}
    >
      {delayed && <AlertTriangle className="h-3 w-3" />}
      {working_days} / {limit}
    </span>
  );
}

export default function BorderSection({
  active,
  title = 'Kasumbalesa Border Tracking',
}: {
  active: boolean;
  title?: string;
}) {
  const { data, loading, error } = useTabData<ImportBorder>(active ? tabEndpoint('border') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={1} /> : null;

  const postNames = data.posts.map((p) => p.name).join(' / ');
  const limits = Array.from(new Set(data.posts.map((p) => p.limit)));
  const limitText =
    limits.length === 1
      ? `max ${limits[0]} working day${limits[0] === 1 ? '' : 's'}`
      : 'the allowance configured on each post';

  if (data.posts.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title={title} icon={<LayoutGrid className="h-4 w-4" />} accentColor="red" />
        <ChartCard>
          <Empty>
            This section tracks how long consignments sit at a border post. Mark the relevant
            points as border posts, and set each one&apos;s working-day allowance, on the{' '}
            <Link href="/masters/transit-points" className="font-medium text-primary-600 hover:underline">
              Transit Points master
            </Link>
            .
          </Empty>
        </ChartCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title={title}
        hint={`${postNames} border tracking`}
        icon={<LayoutGrid className="h-4 w-4" />}
        accentColor="red"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.kpi.total)} label="Total Border Files" color="blue" icon={<Import />} />
        <KpiCard value={nf.format(data.kpi.waiting_drc_entry)} label="Waiting DRC Entry" color="orange" icon={<ClockAlert />} />
        <KpiCard value={nf.format(data.kpi.waiting_dispatch)} label="Waiting Dispatch" color="red" icon={<Clock />} />
        <KpiCard value={nf.format(data.kpi.both_dates_filled)} label="Both Dates Filled" color="green" icon={<CircleCheck />} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.kpi.in_transit)} label="In Transit" color="cyan" icon={<Truck />} />
        <KpiCard value={nf.format(data.kpi.in_progress)} label="In Progress" color="purple" icon={<Clock />} />
        <KpiCard value={nf.format(data.kpi.this_month)} label="This Month" color="teal" icon={<CalendarDays />} />
        <KpiCard value={nf.format(data.kpi.this_year)} label="This Year" color="indigo" icon={<Calendar />} />
      </div>

      {/* The rule, stated where the figures are, with the export beside it. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-l-4 border-l-rose-500 bg-card px-5 py-4">
        <div className="min-w-0 text-sm text-foreground">
          <strong className="inline-flex items-center gap-1.5">
            <Info className="h-4 w-4" /> Delay Rule:
          </strong>{' '}
          DRC Entry &rarr; Dispatch from Border = <strong>{limitText}</strong> (Sat, Sun &amp; DRC
          holidays excluded)
          <span className="ms-3 inline-flex items-center gap-2">
            <StatusBadge status={`${'≤'} ${limits[0] ?? 3} On Time`} tone="emerald" />
            <StatusBadge status={`> ${limits[0] ?? 3} Delayed`} tone="rose" />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Applies at {postNames}.{' '}
            <Link
              href="/masters/transit-points"
              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline"
            >
              <Settings2 className="h-3 w-3" /> Change the posts or the allowance
            </Link>
          </span>
        </div>
        {data.tally.delayed > 0 && (
          <a href={exportHref({ scope: 'border-overstay' })} className="btn-danger btn-sm shrink-0">
            <FileSpreadsheet className="h-4 w-4" /> Export Overstay
          </a>
        )}
      </div>

      {/* A list of records, so the shared DataTable (§4.25) — which also gives
          this table the search, sort, column chooser and serial column the
          design's own DataTables instance had. */}
      <DataTable<BorderFile>
        title="Trucks at Border (Waiting Dispatch)"
        rows={data.files}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search reference, client, horse, trailer..."
        tableId="import-border"
        autoColumns={false}
        emptyMessage="Nothing is waiting at a border post — every file that entered has been dispatched."
        columns={[
          { key: 'mca_ref', header: 'MCA Ref', sortable: true, render: (r) => <strong>{r.mca_ref ?? '—'}</strong> },
          { key: 'client_name', header: 'Client', sortable: true, render: (r) => r.client_name ?? '—' },
          { key: 'horse', header: 'Horse', render: (r) => r.horse || '—' },
          { key: 'trailer_1', header: 'Trailer 1', render: (r) => r.trailer_1 || '—' },
          { key: 'trailer_2', header: 'Trailer 2', render: (r) => r.trailer_2 || '—' },
          {
            key: 'entry_point',
            header: 'Entry Point',
            badge: true,
            render: (r) => <StatusBadge status={r.entry_point ?? '—'} tone="sky" />,
          },
          { key: 'commodity', header: 'Commodity', render: (r) => r.commodity ?? '—' },
          { key: 'drc_entry_date', header: 'DRC Entry', sortable: true, render: (r) => formatDate(r.drc_entry_date) },
          {
            key: 'border_warehouse_arrival_date',
            header: 'Border WH Arr',
            sortable: true,
            render: (r) => formatDate(r.border_warehouse_arrival_date),
          },
          {
            key: 'dispatch_from_border',
            header: 'Disp Border',
            sortable: true,
            render: (r) => formatDate(r.dispatch_from_border),
          },
          {
            key: 'delay',
            header: 'Delay (W.Days)',
            align: 'center',
            sortable: true,
            // Sorted on the measured span, so "worst first" is one click; an
            // unmeasured row sorts below every measured one.
            value: (r) => r.delay.working_days ?? -1,
            render: (r) => <DelayCell file={r} />,
          },
          {
            key: 'document_status',
            header: 'Doc Status',
            badge: true,
            render: (r) => <StatusBadge status={r.document_status ?? 'Not set'} />,
          },
          {
            key: 'remarks',
            header: 'Remarks',
            value: (r) => remarksText(r.remarks),
            render: (r) => {
              const text = remarksText(r.remarks);
              return text ? (
                <span className="block max-w-xs truncate text-xs" title={text}>
                  {text}
                </span>
              ) : (
                '—'
              );
            },
          },
        ]}
        actions={(row) => ({ edit: `/imports/${row.id}` })}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryAlert value={data.tally.total} label="Total at Border" tone="info" />
        <SummaryAlert
          value={data.tally.on_time}
          label={`On Time (${'≤'} ${limits[0] ?? 3} w.days)`}
          tone="success"
        />
        <SummaryAlert value={data.tally.delayed} label={`Delayed (> ${limits[0] ?? 3} w.days)`} tone="danger" />
      </div>
    </div>
  );
}
