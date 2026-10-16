'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck, CalendarCheck, CalendarCheck2, CalendarDays, CalendarRange, ChartArea, ChartBar,
  ChartPie, CircleAlert, Clock, Coins, FileSpreadsheet, FileText, Filter, Landmark, Package,
  Percent, ShieldCheck, Users, X,
} from 'lucide-react';
import { ComboChart, DonutChart, HBarChart } from '@/components/charts/Charts';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type {
  InvoiceKpi, InvoiceOverview, InvoiceStatus, PeriodFlag,
} from '@/db/queries/invoiceDashboardTabs';
import type { InvoiceKind } from '@/schemas/invoice-dashboard';
import InvoiceTable from './InvoiceTable';
import { KIND_LABEL, exportHref, tabEndpoint, useTabData } from './useTabData';

// Overview — headline figures, the trend, and the full invoice list.
//
// The period and status cards are CONTROLS: clicking one narrows the table to
// exactly the invoices it counted (§4.29). Both bands come from SQL with each
// row, so a card and the rows it reveals are counted by one rule.

/** The disjoint bands a cumulative period card covers — this month includes today. */
const PERIOD_COVERS: Record<string, PeriodFlag[]> = {
  TODAY: ['TODAY'],
  THISWEEK: ['TODAY', 'THISWEEK'],
  THISMONTH: ['TODAY', 'THISWEEK', 'THISMONTH'],
  THISYEAR: ['TODAY', 'THISWEEK', 'THISMONTH', 'THISYEAR'],
};

const PERIOD_CARDS: Array<{ value: string; label: string; count: (k: InvoiceKpi) => number; color: string; icon: React.ReactNode }> = [
  { value: 'TODAY', label: 'Today', count: (k) => k.today, color: 'orange', icon: <CalendarDays /> },
  { value: 'THISWEEK', label: 'This Week', count: (k) => k.this_week, color: 'teal', icon: <CalendarRange /> },
  { value: 'THISMONTH', label: 'This Month', count: (k) => k.this_month, color: 'cyan', icon: <CalendarCheck2 /> },
  { value: 'THISYEAR', label: 'This Year', count: (k) => k.this_year, color: 'indigo', icon: <CalendarCheck /> },
];

export const STATUS_CARDS: Array<{ value: InvoiceStatus; count: (k: InvoiceKpi) => number; color: string; icon: React.ReactNode }> = [
  { value: 'Not Validated', count: (k) => k.not_validated, color: 'amber', icon: <CircleAlert /> },
  { value: 'Validated', count: (k) => k.validated, color: 'emerald', icon: <BadgeCheck /> },
  { value: 'DGI Info Pending', count: (k) => k.dgi_pending, color: 'warning', icon: <Clock /> },
  { value: 'DGI Verified', count: (k) => k.dgi_verified, color: 'violet', icon: <ShieldCheck /> },
];

type CardFilter = { kind: 'period' | 'status'; value: string; label: string };

export const usd = (n: number): string => `$${nf2.format(n)}`;

export default function OverviewTab({ kind, active }: { kind: InvoiceKind; active: boolean }) {
  const { data, loading, error } = useTabData<InvoiceOverview>(active ? tabEndpoint(kind, 'overview') : null);
  const [filter, setFilter] = useState<CardFilter | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!filter) return all;
    if (filter.kind === 'status') return all.filter((r) => r.status === filter.value);
    const covered = PERIOD_COVERS[filter.value] ?? [];
    return all.filter((r) => covered.includes(r.period_flag));
  }, [data, filter]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={3} /> : null;

  const { kpi } = data;
  const label = KIND_LABEL[kind];
  const toggle = (next: CardFilter): void =>
    setFilter((f) => (f?.kind === next.kind && f.value === next.value ? null : next));

  // Columns are the month's count; the line is the running value, which makes a
  // quiet month read as a flattening rather than just a short bar.
  let running = 0;
  const cumulative = data.monthly.map((m) => (running += m.value_usd));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ChartArea className="h-4 w-4" /> Overview Analytics
        </h2>
        <a href={exportHref(kind, 'invoices')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.total)} label={`Total ${label} Invoices`} color="blue" icon={<FileText />} />
        <KpiCard value={usd(kpi.total_usd)} label="Total Billed (USD)" color="green" icon={<Coins />} />
        <KpiCard value={usd(kpi.avg_usd)} label="Average Invoice" color="purple" icon={<ChartBar />} />
        <KpiCard value={nf.format(kpi.unique_clients)} label="Unique Clients" color="emerald" icon={<Users />} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={usd(kpi.sub_total_usd)} label="Sub Total (USD)" color="sky" icon={<Coins />} />
        <KpiCard value={usd(kpi.vat_usd)} label="VAT (USD)" color="rose" icon={<Percent />} />
        <KpiCard value={nf2.format(kpi.dgi_usd)} label="DGI Amount" color="dark" icon={<Landmark />} />
        <KpiCard
          value={kpi.total > 0 ? `${Math.round((kpi.dgi_verified / kpi.total) * 100)}%` : '—'}
          label="DGI Verified Rate"
          color="violet"
          icon={<ShieldCheck />}
          sub={`${nf.format(kpi.dgi_verified)} of ${nf.format(kpi.total)} invoices`}
        />
      </div>

      {/* Period and status cards filter the table below; the rest are figures. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PERIOD_CARDS.map((c) => (
          <KpiCard
            key={c.value}
            value={nf.format(c.count(kpi))}
            label={c.label}
            color={c.color}
            icon={c.icon}
            onClick={() => toggle({ kind: 'period', value: c.value, label: c.label })}
            active={filter?.kind === 'period' && filter.value === c.value}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATUS_CARDS.map((c) => (
          <KpiCard
            key={c.value}
            value={nf.format(c.count(kpi))}
            label={c.value}
            color={c.color}
            icon={c.icon}
            onClick={() => toggle({ kind: 'status', value: c.value, label: c.value })}
            active={filter?.kind === 'status' && filter.value === c.value}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Monthly Invoice Trend (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
          {kpi.total === 0 ? (
            <Empty>No {label.toLowerCase()} invoices yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <ComboChart
                  labels={data.monthly.map((m) => m.month_short)}
                  columns={{ label: 'Invoices', values: data.monthly.map((m) => m.count) }}
                  line={{ label: 'Cumulative billed (USD)', values: cumulative }}
                  width={w}
                  height={200}
                  format={(v) => nf2.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Validation Status" icon={<ChartPie className="h-4 w-4" />}>
          {data.status.length === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.status.map((s) => ({ label: s.label, value: s.count }))}
                size={220}
                thickness={44}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Type of Goods — by billed value" icon={<Package className="h-4 w-4" />}>
        <HBarChart
          items={data.goods.slice(0, 10).map((g) => ({
            label: g.label,
            value: g.value_usd,
            note: `${nf.format(g.count)} invoice${g.count === 1 ? '' : 's'}`,
          }))}
          format={usd}
          emptyLabel="No invoices name a type of goods yet."
        />
      </ChartCard>

      <Group
        title={`All ${label} Invoices`}
        hint={`${nf.format(rows.length)} of ${nf.format(data.rows.length)} shown`}
        icon={<FileText className="h-4 w-4" />}
        accentColor="blue"
      >
        {filter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {filter.label} — {nf.format(rows.length)} invoice{rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setFilter(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}
        <InvoiceTable
          kind={kind}
          rows={rows}
          loading={loading}
          emptyMessage={
            filter
              ? `No invoices match "${filter.label}" — clear the filter to see the rest.`
              : `No ${label.toLowerCase()} invoices yet — create the first one from the ${label} Invoice list.`
          }
        />
      </Group>
    </div>
  );
}
