'use client';

import { useMemo, useState } from 'react';
import {
  Banknote, CalendarCheck, CalendarCheck2, CalendarDays, CalendarRange, ChartArea, ChartBar,
  ChartPie, Coins, FileSpreadsheet, FileText, Filter, Layers, Package, Percent, Ship, Users, X,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { ComboChart, DonutChart, HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, compact, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type {
  PeriodFlag,
  QuotationOverview,
  QuotationRow,
} from '@/db/queries/quotationDashboardTabs';

// Overview — the Quotation dashboard's main tab.
//
// Built like the Import Tracking dashboard: gradient KPI cards over the
// headline figures, the distributions beside a twelve-month trend, then the
// full list. The cards that name a PERIOD are controls — clicking one narrows
// the table below to exactly the rows it counted, which is the interaction the
// Licence dashboard established (§4.29).
//
// The period bands come from SQL with each row, so a card and the rows it
// reveals are counted by one rule rather than two.

/** The periods a cumulative card covers — this month includes today. */
const PERIOD_COVERS: Record<string, PeriodFlag[]> = {
  TODAY: ['TODAY'],
  THISWEEK: ['TODAY', 'THISWEEK'],
  THISMONTH: ['TODAY', 'THISWEEK', 'THISMONTH'],
  THISYEAR: ['TODAY', 'THISWEEK', 'THISMONTH', 'THISYEAR'],
};

const PERIOD_CARDS: Array<{
  value: keyof typeof PERIOD_COVERS;
  label: string;
  count: (k: QuotationOverview['kpi']) => number;
  color: string;
  icon: React.ReactNode;
}> = [
  { value: 'TODAY', label: 'Today', count: (k) => k.today, color: 'orange', icon: <CalendarDays /> },
  { value: 'THISWEEK', label: 'This Week', count: (k) => k.this_week, color: 'teal', icon: <CalendarRange /> },
  { value: 'THISMONTH', label: 'This Month', count: (k) => k.this_month, color: 'cyan', icon: <CalendarCheck2 /> },
  { value: 'THISYEAR', label: 'This Year', count: (k) => k.this_year, color: 'indigo', icon: <CalendarCheck /> },
];

const usd = (n: number): string => `$${nf2.format(n)}`;

export default function OverviewTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<QuotationOverview>(
    active ? tabEndpoint('overview') : null,
  );
  const [period, setPeriod] = useState<{ value: string; label: string } | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!period) return all;
    const covered = PERIOD_COVERS[period.value] ?? [];
    return all.filter((r) => covered.includes(r.period_flag));
  }, [data, period]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={6} panels={3} /> : null;

  const { kpi } = data;

  // Columns are the month's count; the line is the running value, which is what
  // makes a quiet month legible as a flattening rather than just a short bar.
  let running = 0;
  const cumulative = data.monthly.map((m) => {
    running += m.value_usd;
    return running;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ChartArea className="h-4 w-4" /> Overview Analytics
        </h2>
        <a href={exportHref({ scope: 'quotations' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.total)} label="Total Quotations" color="blue" icon={<FileText />} />
        <KpiCard value={usd(kpi.total_usd)} label="Total Value (USD)" color="green" icon={<Coins />} />
        <KpiCard value={usd(kpi.avg_usd)} label="Average Value" color="purple" icon={<ChartBar />} />
        <KpiCard
          value={kpi.total_cdf > 0 ? compact.format(kpi.total_cdf) : '—'}
          label="Total Value (CDF)"
          color="dark"
          icon={<Banknote />}
          sub={kpi.with_cdf > 0 ? `${nf.format(kpi.with_cdf)} quotation(s) carry CDF` : 'No CDF quotations yet'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={usd(kpi.sub_total_usd)} label="Sub Total (USD)" color="sky" icon={<Layers />} />
        <KpiCard value={usd(kpi.vat_usd)} label="VAT (USD)" color="amber" icon={<Percent />} />
        <KpiCard
          value={usd(kpi.arsp_usd)}
          label="ARSP (USD)"
          color="rose"
          icon={<Percent />}
          sub={`${nf.format(kpi.arsp_enabled)} with ARSP enabled`}
        />
        <KpiCard value={nf.format(kpi.unique_clients)} label="Unique Clients" color="emerald" icon={<Users />} />
      </div>

      {/* Period cards filter the table below; the rest are figures. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PERIOD_CARDS.map((c) => (
          <KpiCard
            key={c.value}
            value={nf.format(c.count(kpi))}
            label={c.label}
            color={c.color}
            icon={c.icon}
            onClick={() =>
              setPeriod((p) => (p?.value === c.value ? null : { value: c.value, label: c.label }))
            }
            active={period?.value === c.value}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Monthly Quotation Trend (Last 12 Months)"
          icon={<ChartBar className="h-4 w-4" />}
        >
          {kpi.total === 0 ? (
            <Empty>No quotations yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <ComboChart
                  labels={data.monthly.map((m) => m.month_short)}
                  columns={{ label: 'Quotations', values: data.monthly.map((m) => m.count) }}
                  line={{ label: 'Cumulative value (USD)', values: cumulative }}
                  width={w}
                  height={200}
                  format={(v) => nf2.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Kind Distribution" icon={<ChartPie className="h-4 w-4" />}>
          {data.kind.length === 0 ? (
            <Empty>No quotations carry a kind yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.kind.map((k) => ({ label: k.label, value: k.count }))}
                size={220}
                thickness={44}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Transport Mode" icon={<Ship className="h-4 w-4" />}>
          {data.transport.length === 0 ? (
            <Empty>No quotations name a transport mode yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.transport.map((t) => ({ label: t.label, value: t.count }))}
                size={200}
                thickness={100}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Type of Goods — by value" icon={<Package className="h-4 w-4" />}>
          {/* By VALUE rather than by count: the question a goods breakdown
              answers on a quotation screen is where the money is, and a type
              quoted twice for $80k matters more than one quoted ten times for
              $200. The count rides along as the bar's note. */}
          <HBarChart
            items={data.goods.map((g) => ({
              label: g.label,
              value: g.value_usd,
              note: `${nf.format(g.count)} quotation${g.count === 1 ? '' : 's'}`,
            }))}
            format={(v) => usd(v)}
            emptyLabel="No quotations name a type of goods yet."
          />
        </ChartCard>
      </div>

      <Group
        title="All Quotations"
        hint={`${nf.format(rows.length)} of ${nf.format(data.rows.length)} shown`}
        icon={<FileText className="h-4 w-4" />}
        accentColor="blue"
      >
        {period && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {period.label} — {nf.format(rows.length)} quotation
              {rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setPeriod(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}

        <QuotationTable rows={rows} loading={loading} filtered={period !== null} />
      </Group>
    </div>
  );
}

/**
 * The quotation list, shared by the Overview and Value tabs (§4.10) — one set
 * of columns, one set of money formats, one empty state.
 */
export function QuotationTable({
  rows,
  loading,
  filtered,
}: {
  rows: QuotationRow[];
  loading: boolean;
  filtered?: boolean;
}) {
  return (
    <DataTable<QuotationRow>
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      searchPlaceholder="Search ref, client, kind, transport, goods..."
      emptyMessage={
        filtered
          ? 'No quotations in that period — clear the filter to see the rest.'
          : 'No quotations yet — create the first one from the quotation list.'
      }
      exportHref={exportHref({ scope: 'quotations' })}
      columns={[
        { key: 'quotation_ref', header: 'Quotation Ref', sortable: true },
        {
          key: 'quotation_date',
          header: 'Date',
          sortable: true,
          render: (r) => formatDate(r.quotation_date),
        },
        { key: 'client_name', header: 'Client', sortable: true },
        { key: 'kind_name', header: 'Kind', sortable: true },
        { key: 'transport_mode_name', header: 'Transport', sortable: true },
        { key: 'goods_type', header: 'Type of Goods', sortable: true },
        { key: 'line_count', header: 'Lines', align: 'right', sortable: true },
        {
          key: 'sub_total',
          header: 'Sub Total',
          align: 'right',
          sortable: true,
          render: (r) => nf2.format(r.sub_total),
        },
        {
          key: 'vat_amount',
          header: 'VAT',
          align: 'right',
          sortable: true,
          render: (r) => nf2.format(r.vat_amount),
        },
        {
          key: 'arsp_amount',
          header: 'ARSP',
          align: 'right',
          sortable: true,
          defaultHidden: true,
          render: (r) => nf2.format(r.arsp_amount),
        },
        {
          key: 'total_amount',
          header: 'Total (USD)',
          align: 'right',
          sortable: true,
          render: (r) => <strong className="text-foreground">{nf2.format(r.total_amount)}</strong>,
        },
        {
          key: 'total_amount_cdf',
          header: 'Total (CDF)',
          align: 'right',
          sortable: true,
          defaultHidden: true,
          render: (r) => (r.total_amount_cdf === null ? '—' : nf2.format(r.total_amount_cdf)),
        },
      ]}
      actions={(row) => ({ edit: `/quotations/${row.id}` })}
    />
  );
}
