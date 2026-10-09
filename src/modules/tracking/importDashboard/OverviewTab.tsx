'use client';

import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  Box, Boxes, Briefcase, Package, PackageOpen, Palette,
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  CalendarCog,
  Car,
  ChartArea,
  ChartBar,
  ScatterChart,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock,
  Cloud,
  FileCheck2,
  Import,
  Flag,
  Gift,
  Leaf,
  ListChecks,
  Monitor,
  Plane,
  Sailboat,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Snowflake,
  Star,
  Sun,
  Table as TableIcon,
  Tag,
  Train,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { BarChart, ComboChart, HBarChart, StackedColumnChart } from '@/components/charts/Charts';
import {
  AccentCard,
  ChartCard,
  Empty,
  GridTable,
  KpiCard,
  MiniCard,
  MiniCardStrip,
  ChartBox,
  Group,
  Td,
  Th,
  Tr,
  YoyCard,
  accent,
  nf,
} from '../dashboardUi';
import { tabEndpoint, useTabData } from './useTabData';
import { TabError, TabSkeleton } from '../dashboardUi';
import type { ImportOverviewExtras } from '@/db/queries/importDashboardTabs';

// Overview — the uploaded dashboard's main tab, section for section.
//
// Colour and icon assignment is positional, exactly as the design does it: a
// palette is cycled over whatever rows come back, so a master row added
// tomorrow gets a card without anyone choosing a hue for it. The named maps
// (transport, quarter) are the design's own.

const STATUS_COLORS = [
  'cyan', 'orange', 'green', 'red', 'purple', 'sky',
  'emerald', 'violet', 'fuchsia', 'rose', 'teal', 'indigo',
  'pink', 'amber', 'lime', 'slate',
];
const STATUS_ICONS = [
  <Truck key="0" />, <Clock key="1" />, <CheckCircle2 key="2" />, <X key="3" />,
  <AlertCircle key="4" />, <ShieldCheck key="5" />, <FileCheck2 key="6" />,
  <Clock key="7" />, <Flag key="8" />, <Star key="9" />,
];

const QUARTERS = [
  { n: 1, color: 'emerald', period: 'Jan - Mar', icon: <Leaf /> },
  { n: 2, color: 'sky', period: 'Apr - Jun', icon: <Sun /> },
  { n: 3, color: 'amber', period: 'Jul - Sep', icon: <Cloud /> },
  { n: 4, color: 'red', period: 'Oct - Dec', icon: <Snowflake /> },
] as const;

const TRANSPORT_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  ROAD: { color: 'blue', icon: <Car /> },
  AIR: { color: 'sky', icon: <Plane /> },
  WAGON: { color: 'emerald', icon: <Train /> },
  LAKE: { color: 'violet', icon: <Sailboat /> },
};

const KIND_COLORS = ['violet', 'pink', 'amber', 'lime', 'sky', 'rose', 'emerald', 'fuchsia'];
const CLEARANCE_COLORS = ['green', 'blue', 'orange', 'purple', 'cyan'];
const CURRENCY_COLORS = ['teal', 'indigo', 'pink', 'amber', 'lime'];
const REGIME_COLORS = ['purple', 'cyan', 'orange', 'teal', 'pink'];
const GOODS_ICONS = [
  <Package key="0" />, <Boxes key="1" />, <Box key="2" />, <PackageOpen key="3" />,
  <Gift key="4" />, <ShoppingBag key="5" />, <Briefcase key="6" />, <Wrench key="7" />,
  <Monitor key="8" />, <Palette key="9" />,
];

/** A plain centred count card — the design's shape for goods and entry points. */
function PlainCard({
  value,
  label,
  icon,
  color,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-center shadow-sm">
      <div className="flex justify-center [&>svg]:h-10 [&>svg]:w-10" style={{ color: accent(color) }}>
        {icon}
      </div>
      <h4 className="mt-2 text-2xl font-bold text-foreground">{nf.format(value)}</h4>
      <p className="truncate text-sm text-muted-foreground" title={label}>
        {label}
      </p>
    </div>
  );
}

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export default function OverviewTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ImportOverviewExtras>(
    active ? tabEndpoint('overview') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={3} /> : null;

  const year = new Date().getFullYear();
  const mvm = data.month_vs_month;
  // Newest first for the strip and the table, oldest first for the charts —
  // a trend reads left to right, a list reads most-recent-first.
  const monthsDesc = [...data.monthly_24].slice().reverse();
  const maxMonthly = Math.max(1, ...data.monthly_24.map((m) => m.files));
  const quarters = data.quarterly.filter((q) => q.year === year);

  const change = (now: number, before: number, label: string) => {
    if (before === 0) return { text: `no ${label} last month`, positive: true };
    const delta = pct(now - before, before);
    return {
      text: `${delta >= 0 ? '+' : ''}${delta}% vs last month (${nf.format(before)})`,
      positive: delta >= 0,
    };
  };

  const grand = data.monthly_24.reduce(
    (a, m) => ({
      files: a.files + m.files,
      completed: a.completed + m.completed,
      in_progress: a.in_progress + m.in_progress,
      in_transit: a.in_transit + m.in_transit,
    }),
    { files: 0, completed: 0, in_progress: 0, in_transit: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.kpi.total)} label="Total Imports" color="blue" icon={<Import />} href="/imports" />
        <KpiCard value={nf.format(data.kpi.in_transit)} label="In Transit" color="cyan" icon={<Truck />} href="/imports?status_filters=in_transit" />
        <KpiCard value={nf.format(data.kpi.in_progress)} label="In Progress" color="orange" icon={<Clock />} href="/imports?status_filters=in_progress" />
        <KpiCard value={nf.format(data.kpi.completed)} label="Clearing Completed" color="green" icon={<CheckCircle2 />} href="/imports?status_filters=completed" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard value={nf.format(data.periods.today)} label="Today" color="red" icon={<CalendarDays />} />
        <KpiCard value={nf.format(data.periods.this_week)} label="This Week" color="purple" icon={<CalendarRange />} />
        <KpiCard value={nf.format(data.periods.this_month)} label="This Month" color="teal" icon={<CalendarCheck2 />} />
        <KpiCard value={nf.format(data.periods.this_quarter)} label="This Quarter" color="amber" icon={<CalendarCog />} />
        <KpiCard value={nf.format(data.periods.this_year)} label="This Year" color="indigo" icon={<Calendar />} />
      </div>

      {/* Clearing status */}
      <Group title="Clearing Status" hint="All clearing statuses with file counts" icon={<ListChecks className="h-4 w-4" />}>
      {data.status_cards.length === 0 ? (
        <ChartCard><Empty>No clearing statuses are configured yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {data.status_cards.map((s, i) => (
            <KpiCard
              key={s.id}
              value={nf.format(s.count)}
              label={s.name}
              color={STATUS_COLORS[i % STATUS_COLORS.length]}
              icon={STATUS_ICONS[i % STATUS_ICONS.length]}
            />
          ))}
        </div>
      )}
      </Group>

      {/* Quarterly */}
      <Group title={`Quarterly Breakdown — ${year}`} hint="Import files grouped by quarter" icon={<ChartNoAxesCombined className="h-4 w-4" />} accentColor="emerald">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUARTERS.map((q) => {
          const row = quarters.find((r) => r.quarter === q.n);
          return (
            <AccentCard
              key={q.n}
              color={q.color}
              icon={q.icon}
              value={nf.format(row?.files ?? 0)}
              label={`Q${q.n} ${year}`}
              desc={
                <>
                  <div className="text-[0.8rem] font-semibold text-muted-foreground">{q.period}</div>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {nf.format(row?.completed ?? 0)} Completed
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {nf.format(row?.clients ?? 0)} Clients
                    </span>
                  </div>
                </>
              }
            />
          );
        })}
      </div>

      </Group>

      {/* Monthly trend */}
      <ChartCard
        title="Files Per Month — Last 24 Months"
        icon={<ChartBar className="h-4 w-4" />}
        action={
          <span className="text-xs text-muted-foreground">
            Columns are files opened, the line is files cleared
          </span>
        }
      >
        {grand.files === 0 ? (
          <Empty>No files opened in the last two years.</Empty>
        ) : (
          <ChartBox span="full">
            {(w) => (
              <ComboChart
                labels={data.monthly_24.map((m) => m.month_short)}
                columns={{ label: 'Total Files', values: data.monthly_24.map((m) => m.files) }}
                line={{ label: 'Completed', values: data.monthly_24.map((m) => m.completed) }}
                width={w}
                height={200}
                format={(v) => nf.format(v)}
              />
            )}
          </ChartBox>
        )}
      </ChartCard>

      {/* Month strip */}
      <ChartCard
        title="Each Month — File Count"
        icon={<CalendarCog className="h-4 w-4" />}
        action={<span className="text-xs text-muted-foreground">Scroll for older months</span>}
      >
        <MiniCardStrip>
          {monthsDesc.map((m) => (
            <MiniCard key={m.month} value={m.files} label={m.month_name} max={maxMonthly} />
          ))}
        </MiniCardStrip>
      </ChartCard>

      {/* Month vs month */}
      <Group
        title="This Month vs Last Month"
        hint={`${mvm.current_label} vs ${mvm.previous_label}`}
        icon={<TrendingUp className="h-4 w-4" />}
        accentColor="violet"
      >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <YoyCard value={nf.format(mvm.current.files)} label={`Total Files — ${mvm.current_label}`} change={change(mvm.current.files, mvm.previous.files, 'files')} />
        <YoyCard value={nf.format(mvm.current.completed)} label={`Completed — ${mvm.current_label}`} change={change(mvm.current.completed, mvm.previous.completed, 'completions')} />
        <YoyCard value={nf.format(mvm.current.clients)} label={`Active Clients — ${mvm.current_label}`} change={change(mvm.current.clients, mvm.previous.clients, 'clients')} />
        <YoyCard value={nf.format(mvm.current.licenses)} label={`Licences Used — ${mvm.current_label}`} change={change(mvm.current.licenses, mvm.previous.licenses, 'licences')} />
      </div>
      </Group>

      {/* Completion + daily */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly Completion Breakdown" icon={<ChartArea className="h-4 w-4" />}>
          {grand.files === 0 ? (
            <Empty>No files to break down yet.</Empty>
          ) : (
            <ChartBox>
              {(w) => (
                <StackedColumnChart
                  labels={data.monthly_24.slice(-12).map((m) => m.month_short)}
                  series={[
                    { label: 'Completed', values: data.monthly_24.slice(-12).map((m) => m.completed) },
                    { label: 'In Progress', values: data.monthly_24.slice(-12).map((m) => m.in_progress) },
                    { label: 'In Transit', values: data.monthly_24.slice(-12).map((m) => m.in_transit) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title={`Daily Files — ${mvm.current_label}`} icon={<ScatterChart className="h-4 w-4" />}>
          {data.periods.this_month === 0 ? (
            <Empty>No files opened yet this month.</Empty>
          ) : (
            <ChartBox>
              {(w) => (
                <BarChart
                  labels={data.daily.map((d) => (d.day % 3 === 1 ? String(d.day) : ''))}
                  series={[
                    { label: 'Files', values: data.daily.map((d) => d.files) },
                    { label: 'Completed', values: data.daily.map((d) => d.completed) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>
      </div>

      {/* Top clients */}
      <ChartCard title={`Top 10 Clients — ${year}`} icon={<Trophy className="h-4 w-4" />}>
        <HBarChart
          items={data.top_clients.map((c) => ({
            label: c.client_name ?? '—',
            value: c.files,
            note: `${c.completion_rate}% done`,
          }))}
          format={(v) => nf.format(v)}
          emptyLabel={`No files opened against any client in ${year}.`}
        />
      </ChartCard>

      {/* Transport */}
      <Group title="Transport Mode Statistics" icon={<Truck className="h-4 w-4" />} accentColor="sky">
      {data.transport.length === 0 ? (
        <ChartCard><Empty>No files carry a transport mode yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.transport.map((t) => {
            const style = TRANSPORT_STYLE[t.label] ?? { color: 'slate', icon: <Truck /> };
            return (
              <KpiCard
                key={t.label}
                value={nf.format(t.count)}
                label={t.label}
                color={style.color}
                icon={style.icon}
                footer={
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" /> {nf.format(t.in_transit)} Transit
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {nf.format(t.in_progress)} Progress
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {nf.format(t.completed)} Cleared
                    </span>
                  </>
                }
              />
            );
          })}
        </div>
      )}
      </Group>

      {/* Kind */}
      <Group title="Import Kind Distribution" icon={<Tag className="h-4 w-4" />}>
      {data.distributions.kind.length === 0 ? (
        <ChartCard><Empty>No files carry a kind yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.distributions.kind.map((k, i) => (
            <KpiCard key={k.label} value={nf.format(k.count)} label={k.label} color={KIND_COLORS[i % KIND_COLORS.length]} icon={<Tag />} />
          ))}
        </div>
      )}

      </Group>

      {/* Goods */}
      <Group title="Type of Goods" icon={<Package className="h-4 w-4" />}>
      {data.distributions.goods.length === 0 ? (
        <ChartCard><Empty>No files carry a type of goods yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.distributions.goods.map((g, i) => (
            <PlainCard key={g.label} value={g.count} label={g.label} icon={GOODS_ICONS[i % GOODS_ICONS.length]} color="blue" />
          ))}
        </div>
      )}

      </Group>

      {/* Clearance */}
      <Group title="Clearance Type" icon={<ListChecks className="h-4 w-4" />}>
      {data.distributions.clearance.length === 0 ? (
        <ChartCard><Empty>No files carry a clearance type yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.distributions.clearance.map((c, i) => (
            <KpiCard key={c.label} value={nf.format(c.count)} label={c.label} color={CLEARANCE_COLORS[i % CLEARANCE_COLORS.length]} icon={<FileCheck2 />} />
          ))}
        </div>
      )}

      </Group>

      {/* Currency */}
      <Group title="Currency Distribution" icon={<Banknote className="h-4 w-4" />}>
      {data.distributions.currency.length === 0 ? (
        <ChartCard><Empty>No files carry a currency yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.distributions.currency.map((c, i) => (
            <KpiCard key={c.label} value={nf.format(c.count)} label={c.label} color={CURRENCY_COLORS[i % CURRENCY_COLORS.length]} icon={<Banknote />} />
          ))}
        </div>
      )}

      </Group>

      {/* Entry point */}
      <Group title="Entry Point Distribution" icon={<Flag className="h-4 w-4" />}>
      {data.distributions.entry_point.length === 0 ? (
        <ChartCard><Empty>No files carry an entry point yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.distributions.entry_point.map((e) => (
            <PlainCard key={e.label} value={e.count} label={e.label} icon={<Flag />} color="green" />
          ))}
        </div>
      )}

      </Group>

      {/* Regime */}
      <Group title="Regime Distribution" icon={<Shield className="h-4 w-4" />}>
      {data.distributions.regime.length === 0 ? (
        <ChartCard><Empty>No files carry a regime yet.</Empty></ChartCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.distributions.regime.map((r, i) => (
            <KpiCard key={r.label} value={nf.format(r.count)} label={r.label} color={REGIME_COLORS[i % REGIME_COLORS.length]} icon={<BadgeCheck />} />
          ))}
        </div>
      )}

      </Group>

      {/* Monthly table */}
      <Group title="Monthly Files Breakdown Table" icon={<TableIcon className="h-4 w-4" />}>
      <ChartCard>
        <GridTable
          head={
            <tr>
              <Th align="left">Month</Th>
              <Th>Total Files</Th>
              <Th>Completed</Th>
              <Th>In Progress</Th>
              <Th>In Transit</Th>
              <Th>Completion %</Th>
            </tr>
          }
        >
          {monthsDesc.filter((m) => m.files > 0).length === 0 ? (
            <tr>
              <Td className="text-muted-foreground" align="center">
                <span className="block py-6">No files opened in the last two years.</span>
              </Td>
              <Td /><Td /><Td /><Td /><Td />
            </tr>
          ) : (
            <>
              {monthsDesc
                .filter((m) => m.files > 0)
                .map((m) => {
                  const rate = pct(m.completed, m.files);
                  return (
                    <Tr key={m.month}>
                      <Td align="left"><strong>{m.month_name}</strong></Td>
                      <Td><strong>{nf.format(m.files)}</strong></Td>
                      <Td>
                        <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                          {nf.format(m.completed)}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                          {nf.format(m.in_progress)}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-block rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
                          {nf.format(m.in_transit)}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex h-[18px] w-full overflow-hidden rounded bg-muted">
                          <span
                            className="flex items-center justify-center bg-emerald-500 text-[10px] font-bold text-white"
                            style={{ width: `${rate}%`, minWidth: rate > 0 ? '2rem' : 0 }}
                          >
                            {rate > 0 ? `${rate}%` : ''}
                          </span>
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              <Tr tone="total">
                <Td align="left"><strong>GRAND TOTAL</strong></Td>
                <Td><strong>{nf.format(grand.files)}</strong></Td>
                <Td><strong>{nf.format(grand.completed)}</strong></Td>
                <Td><strong>{nf.format(grand.in_progress)}</strong></Td>
                <Td><strong>{nf.format(grand.in_transit)}</strong></Td>
                <Td><strong>{pct(grand.completed, grand.files)}%</strong></Td>
              </Tr>
            </>
          )}
        </GridTable>
      </ChartCard>
      </Group>
    </div>
  );
}
