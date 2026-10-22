'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck, Calculator, CalendarCheck, CalendarCheck2, CalendarDays, CalendarRange, ChartArea,
  ChartBar, Coins, FileSpreadsheet, Filter, Landmark, ListOrdered, Scale, ShieldCheck, Truck,
  Users, Workflow, X,
} from 'lucide-react';
import { ComboChart, HBarChart } from '@/components/charts/Charts';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type {
  Distribution, FicheKpi, FicheOverview, PeriodFlag, StateCount,
} from '@/db/queries/ficheDashboardTabs';
import FicheTable from './FicheTable';
import { exportHref, tabEndpoint, useTabData } from './useTabData';

// Overview — headline figures, the trend, and the full fiche list.
//
// The period and state cards are CONTROLS: clicking one narrows the table to
// exactly the fiches it counted (§4.29). Both come from SQL with each row, so a
// card and the rows it reveals are counted by one rule. The state cards are
// whatever the fiche workflow configures (§4.6), in the order it reaches them.

/** The disjoint bands a cumulative period card covers — this month includes today. */
const PERIOD_COVERS: Record<string, PeriodFlag[]> = {
  TODAY: ['TODAY'],
  THISWEEK: ['TODAY', 'THISWEEK'],
  THISMONTH: ['TODAY', 'THISWEEK', 'THISMONTH'],
  THISYEAR: ['TODAY', 'THISWEEK', 'THISMONTH', 'THISYEAR'],
};

const PERIOD_CARDS: Array<{ value: string; label: string; count: (k: FicheKpi) => number; color: string; icon: React.ReactNode }> = [
  { value: 'TODAY', label: 'Today', count: (k) => k.today, color: 'orange', icon: <CalendarDays /> },
  { value: 'THISWEEK', label: 'This Week', count: (k) => k.this_week, color: 'teal', icon: <CalendarRange /> },
  { value: 'THISMONTH', label: 'This Month', count: (k) => k.this_month, color: 'cyan', icon: <CalendarCheck2 /> },
  { value: 'THISYEAR', label: 'This Year', count: (k) => k.this_year, color: 'indigo', icon: <CalendarCheck /> },
];

/**
 * A state card's fill, from where the state sits in the workflow rather than
 * from its name: finished is green, the first step is amber (nothing done yet),
 * anything between is moving, and a state the workflow no longer knows is grey.
 */
export function stateColor(s: StateCount, index: number): string {
  if (s.terminal) return 'emerald';
  if (s.state === '') return 'slate';
  return index === 0 ? 'amber' : 'sky';
}

/** The states whose fiches are locked — no step leads out of them. */
export const terminalOf = (states: StateCount[]): Set<string> =>
  new Set(states.filter((s) => s.terminal).map((s) => s.state));

/**
 * CIF is in each fiche's own currency, so it is only totalled within one. With
 * a single currency the card is that total; with several it says so and lists
 * each, rather than adding dollars to euros.
 */
export function cifCard(currencies: Distribution[]): { value: string; label: string; sub?: string } {
  if (currencies.length === 0) return { value: '—', label: 'Total CIF' };
  if (currencies.length === 1) {
    return { value: nf2.format(currencies[0].cif), label: `Total CIF (${currencies[0].label})` };
  }
  return {
    value: `${currencies.length} currencies`,
    label: 'Total CIF',
    sub: currencies.map((c) => `${c.label} ${nf2.format(c.cif)}`).join(' · '),
  };
}

type CardFilter = { kind: 'period' | 'state'; value: string; label: string };

const splitItems = (rows: Distribution[]) =>
  rows.slice(0, 10).map((d) => ({
    label: d.label,
    value: d.count,
    note: `${nf2.format(d.ddi)} CDF`,
  }));

export default function OverviewTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<FicheOverview>(active ? tabEndpoint('overview') : null);
  const [filter, setFilter] = useState<CardFilter | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!filter) return all;
    if (filter.kind === 'state') return all.filter((r) => r.state === filter.value);
    const covered = PERIOD_COVERS[filter.value] ?? [];
    return all.filter((r) => covered.includes(r.period_flag));
  }, [data, filter]);

  const terminal = useMemo(() => terminalOf(data?.states ?? []), [data]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={3} /> : null;

  const { kpi } = data;
  const cif = cifCard(data.currencies);
  const toggle = (next: CardFilter): void =>
    setFilter((f) => (f?.kind === next.kind && f.value === next.value ? null : next));

  // Columns are the month's fiches; the line is the running count over the
  // window, so a quiet month reads as a flattening rather than just a short bar.
  let running = 0;
  const cumulative = data.monthly.map((m) => (running += m.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ChartArea className="h-4 w-4" /> Overview Analytics
        </h2>
        <a href={exportHref('fiches')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.total)} label="Total Fiches" color="blue" icon={<Calculator />} />
        <KpiCard value={cif.value} label={cif.label} sub={cif.sub} color="green" icon={<Coins />} />
        <KpiCard value={nf2.format(kpi.ddi_total)} label="Total DDI (CDF)" color="rose" icon={<Landmark />} />
        <KpiCard
          value={kpi.avg_coefficient === null ? '—' : kpi.avg_coefficient.toFixed(4)}
          label="Average Coefficient"
          color="purple"
          icon={<Scale />}
          sub="CIF ÷ FOB, averaged over fiches"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.unique_clients)} label="Unique Clients" color="emerald" icon={<Users />} />
        <KpiCard value={nf.format(kpi.lines)} label="Tariff Lines" color="sky" icon={<ListOrdered />} />
        <KpiCard value={nf.format(kpi.verified)} label="Verified" color="violet" icon={<BadgeCheck />} />
        <KpiCard value={nf.format(kpi.audited)} label="Audited" color="dark" icon={<ShieldCheck />} />
      </div>

      {/* Period and state cards filter the table below; the rest are figures. */}
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
        {data.states.map((s, i) => (
          <KpiCard
            key={s.state || '(none)'}
            value={nf.format(s.count)}
            label={s.label}
            color={stateColor(s, i)}
            icon={<Workflow />}
            sub={`${nf2.format(s.ddi)} CDF DDI`}
            onClick={() => toggle({ kind: 'state', value: s.state, label: s.label })}
            active={filter?.kind === 'state' && filter.value === s.state}
          />
        ))}
      </div>

      <ChartCard title="Monthly Fiches (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
        {kpi.total === 0 ? (
          <Empty>No fiches yet — raise one on an import file from the Fiche de Calcul list.</Empty>
        ) : (
          <ChartBox span="full">
            {(w) => (
              <ComboChart
                labels={data.monthly.map((m) => m.month_short)}
                columns={{ label: 'Fiches', values: data.monthly.map((m) => m.count) }}
                line={{ label: 'Cumulative fiches', values: cumulative }}
                width={w}
                height={200}
                format={(v) => nf.format(v)}
              />
            )}
          </ChartBox>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="By Regime — fiches" icon={<Landmark className="h-4 w-4" />}>
          <HBarChart items={splitItems(data.regimes)} format={(v) => nf.format(v)} emptyLabel="No fiches name a regime yet." />
        </ChartCard>
        <ChartCard title="By Transport Mode — fiches" icon={<Truck className="h-4 w-4" />}>
          <HBarChart
            items={splitItems(data.transports)}
            format={(v) => nf.format(v)}
            emptyLabel="No fiches name a transport mode yet."
          />
        </ChartCard>
        <ChartCard title="CIF by Currency" icon={<Coins className="h-4 w-4" />}>
          <HBarChart
            items={data.currencies.map((c) => ({
              label: c.label,
              value: c.cif,
              note: `${nf.format(c.count)} fiche${c.count === 1 ? '' : 's'}`,
            }))}
            format={(v) => nf2.format(v)}
            emptyLabel="No fiches yet."
          />
        </ChartCard>
      </div>

      <Group
        title="All Fiches"
        hint={`${nf.format(rows.length)} of ${nf.format(data.rows.length)} shown`}
        icon={<Calculator className="h-4 w-4" />}
        accentColor="blue"
      >
        {filter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {filter.label} — {nf.format(rows.length)} fiche{rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setFilter(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}
        <FicheTable
          rows={rows}
          loading={loading}
          terminal={terminal}
          emptyMessage={
            filter
              ? `No fiches match "${filter.label}" — clear the filter to see the rest.`
              : 'No fiches yet — raise the first one on an import file from the Fiche de Calcul list.'
          }
        />
      </Group>
    </div>
  );
}
