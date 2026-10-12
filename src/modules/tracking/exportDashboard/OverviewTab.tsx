'use client';

import {
  Archive, Banknote, BadgeCheck, Bookmark, Box, Calendar, CalendarCheck2, CalendarCog,
  CalendarDays, CalendarRange, Car, ChartArea, ChartBar, ChartPie, CheckCircle2, Clock,
  FileSpreadsheet, FileText, Flag, Lock, Package, Plane, Send, ShieldCheck, Tag, Tags,
  Train, Truck, Users,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, DonutChart, HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartBox, ChartCard, Empty, GridTable, Group, KpiCard, TabError, TabSkeleton,
  Td, Th, Tr, compact, nf, nf2,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { ExportOverview } from '@/db/queries/exportDashboardTabs';

// Overview — the uploaded Export dashboard's main tab, section for section.
//
// Colour and icon assignment is positional, exactly as the design does it: a
// palette is cycled over whatever rows come back, so a master row added
// tomorrow gets a card without anyone choosing a hue for it.

const KIND_COLORS = ['violet', 'pink', 'amber', 'lime', 'sky', 'rose', 'emerald', 'fuchsia'];
const KIND_ICONS = [
  <Tag key="0" />, <Tags key="1" />, <Bookmark key="2" />, <Box key="3" />,
  <Package key="4" />, <Archive key="5" />, <FileText key="6" />, <BadgeCheck key="7" />,
];

const TRANSPORT_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  ROAD: { color: 'blue', icon: <Car /> },
  AIR: { color: 'sky', icon: <Plane /> },
  WAGON: { color: 'emerald', icon: <Train /> },
  LAKE: { color: 'violet', icon: <Send /> },
};

/** The eight timeline averages, in the design's order and hues. */
const TIMELINE_CARDS = [
  { key: 'loading_to_pv', label: 'Loading to PV (Days)', color: 'sky' },
  { key: 'days_in_customs', label: 'Days in Customs', color: 'emerald' },
  { key: 'ceec_processing', label: 'CEEC Processing (Days)', color: 'fuchsia' },
  { key: 'total_cycle_time', label: 'Total Cycle Time (Days)', color: 'dark' },
  { key: 'mindiv_processing', label: 'Min Div Processing', color: 'slate' },
  { key: 'to_liquidation', label: 'To Liquidation (Days)', color: 'rose' },
  { key: 'liquidation_to_quittance', label: 'Liquidation to Quittance', color: 'amber' },
  { key: 'loading_to_customs', label: 'Loading to Customs', color: 'blue' },
] as const;

export default function OverviewTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ExportOverview>(
    active ? tabEndpoint('overview') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={3} /> : null;

  const span = (key: string): string => {
    const row = data.timeline.find((t) => t.key === key);
    return row?.days === null || row?.days === undefined ? '—' : row.days.toFixed(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ChartArea className="h-4 w-4" /> Overview Analytics
        </h2>
        <a href={exportHref({ scope: 'overview' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.kpi.total)} label="Total Exports" color="blue" icon={<Send />} href="/exports" />
        <KpiCard value={nf.format(data.kpi.in_transit)} label="In Transit" color="cyan" icon={<Truck />} href="/exports?status_filters=in_transit" />
        <KpiCard value={nf.format(data.kpi.in_progress)} label="In Progress" color="orange" icon={<Clock />} href="/exports?status_filters=in_progress" />
        <KpiCard value={nf.format(data.kpi.completed)} label="Clearing Completed" color="green" icon={<CheckCircle2 />} href="/exports?status_filters=completed" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.kpi.today)} label="Today" color="red" icon={<CalendarDays />} />
        <KpiCard value={nf.format(data.kpi.this_week)} label="This Week" color="purple" icon={<CalendarRange />} />
        <KpiCard value={nf.format(data.kpi.this_month)} label="This Month" color="teal" icon={<CalendarCheck2 />} />
        <KpiCard value={nf.format(data.kpi.this_year)} label="This Year" color="indigo" icon={<Calendar />} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.extended.unique_invoices)} label="Unique Invoices" color="violet" icon={<FileText />} />
        <KpiCard value={nf.format(data.extended.unique_buyers)} label="Unique Buyers" color="pink" icon={<Users />} />
        <KpiCard value={nf.format(data.extended.total_seals)} label="Total Seals" color="lime" icon={<Lock />} />
        <KpiCard value={nf.format(data.extended.total_bags)} label="Total Bags" color="amber" icon={<Package />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Monthly Export Trend (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
          {data.kpi.total === 0 ? (
            <Empty>No export files yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <BarChart
                  labels={data.monthly.map((m) => m.month_short)}
                  series={[{ label: 'Exports', values: data.monthly.map((m) => m.files) }]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Clearing Status" icon={<ChartPie className="h-4 w-4" />}>
          {data.status_cards.every((s) => s.count === 0) ? (
            <Empty>No files carry a clearing status yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.status_cards.filter((s) => s.count > 0).map((s) => ({ label: s.name, value: s.count }))}
                size={220}
                thickness={44}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Kind Distribution" icon={<ChartPie className="h-4 w-4" />}>
          {data.distributions.kind.length === 0 ? (
            <Empty>No files carry a kind yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.distributions.kind.map((k) => ({ label: k.label, value: k.count }))}
                size={220}
                thickness={110}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Goods Type Distribution" icon={<ChartBar className="h-4 w-4" />}>
          <HBarChart
            items={data.distributions.goods.map((g) => ({ label: g.label, value: g.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No files carry a type of goods yet."
          />
        </ChartCard>
      </div>

      <Group
        title="Average Processing Timeline"
        hint="Average days between key milestones, over the files that recorded both ends"
        icon={<Clock className="h-4 w-4" />}
        accentColor="sky"
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TIMELINE_CARDS.map((t) => (
            <KpiCard key={t.key} value={span(t.key)} label={t.label} color={t.color} icon={<Clock />} />
          ))}
        </div>
      </Group>

      <Group title="Transport Mode Statistics" icon={<Truck className="h-4 w-4" />} accentColor="blue">
        {data.transport.length === 0 ? (
          <ChartCard><Empty>No files carry a transport mode yet.</Empty></ChartCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <Group title="Export Kind Distribution" icon={<Tag className="h-4 w-4" />} accentColor="violet">
        {data.distributions.kind.length === 0 ? (
          <ChartCard><Empty>No files carry a kind yet.</Empty></ChartCard>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {data.distributions.kind.map((k, i) => (
              <KpiCard
                key={k.label}
                value={nf.format(k.count)}
                label={k.label}
                color={KIND_COLORS[i % KIND_COLORS.length]}
                icon={KIND_ICONS[i % KIND_ICONS.length]}
              />
            ))}
          </div>
        )}
      </Group>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Clearing Status Distribution" icon={<Flag className="h-4 w-4" />}>
          <GridTable head={<tr><Th align="left">Status</Th><Th>Count</Th></tr>}>
            {data.status_cards.map((s) => (
              <Tr key={s.id}>
                <Td align="left">
                  <StatusBadge status={s.name} />
                </Td>
                <Td>
                  {/* A status nobody has used reads as muted rather than as a
                      zero competing with the real counts. */}
                  <strong className={s.count > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                    {nf.format(s.count)}
                  </strong>
                </Td>
              </Tr>
            ))}
          </GridTable>
        </ChartCard>

        {/* Two distributions side by side, as the design pairs them — the
            columns are independent, so the shorter list simply runs out. */}
        <ChartCard title="Currency / Exit Point" icon={<Banknote className="h-4 w-4" />}>
          <GridTable
            head={
              <tr>
                <Th align="left">Currency</Th>
                <Th>Count</Th>
                <Th align="left">Exit Point</Th>
                <Th>Count</Th>
              </tr>
            }
          >
            {Array.from({
              length: Math.max(data.distributions.currency.length, data.distributions.exit_point.length),
            }).map((_, i) => {
              const cu = data.distributions.currency[i];
              const ep = data.distributions.exit_point[i];
              return (
                <Tr key={i}>
                  <Td align="left">{cu?.label ?? ''}</Td>
                  <Td>{cu ? nf.format(cu.count) : ''}</Td>
                  <Td align="left">{ep?.label ?? ''}</Td>
                  <Td>{ep ? nf.format(ep.count) : ''}</Td>
                </Tr>
              );
            })}
          </GridTable>
        </ChartCard>
      </div>

      <Group title="Regime & Clearance Type" icon={<ShieldCheck className="h-4 w-4" />} accentColor="teal">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Regime">
            <GridTable head={<tr><Th align="left">Regime</Th><Th>Count</Th></tr>}>
              {data.distributions.regime.map((r) => (
                <Tr key={r.label}>
                  <Td align="left">{r.label}</Td>
                  <Td><strong>{nf.format(r.count)}</strong></Td>
                </Tr>
              ))}
            </GridTable>
          </ChartCard>
          <ChartCard title="Clearance Type">
            <GridTable head={<tr><Th align="left">Clearance</Th><Th>Count</Th></tr>}>
              {data.distributions.clearance.map((c) => (
                <Tr key={c.label}>
                  <Td align="left">{c.label}</Td>
                  <Td><strong>{nf.format(c.count)}</strong></Td>
                </Tr>
              ))}
            </GridTable>
          </ChartCard>
        </div>
      </Group>

      <DataTable<ExportOverview['recent'][number]>
        title="Recent Exports (Last 50)"
        rows={data.recent}
        rowKey={(r) => r.id}
        searchPlaceholder="Search reference, client, buyer..."
        tableId="export-recent"
        autoColumns={false}
        emptyMessage="No export files yet — create the first one from the Exports list."
        columns={[
          { key: 'mca_ref', header: 'MCA Ref', sortable: true, render: (r) => <strong>{r.mca_ref ?? '—'}</strong> },
          { key: 'invoice', header: 'Invoice', render: (r) => r.invoice ?? '—' },
          // §4.15 — the client is a column on someone else's row, so the code.
          { key: 'client_name', header: 'Client', sortable: true, render: (r) => r.client_name ?? '—' },
          { key: 'buyer', header: 'Buyer', render: (r) => r.buyer ?? '—' },
          { key: 'kind', header: 'Kind', render: (r) => r.kind ?? '—' },
          { key: 'weight', header: 'Weight', align: 'right', sortable: true, render: (r) => nf2.format(r.weight ?? 0) },
          { key: 'fob', header: 'FOB', align: 'right', sortable: true, render: (r) => nf2.format(r.fob ?? 0) },
          { key: 'status', header: 'Status', badge: true, render: (r) => <StatusBadge status={r.status ?? 'Pending'} /> },
          { key: 'created_at', header: 'Created', sortable: true, render: (r) => formatDate(r.created_at) },
        ]}
        actions={(row) => ({ edit: `/exports/${row.id}` })}
      />

      <p className="text-xs text-muted-foreground">
        Total weight {compact.format(data.kpi.total_weight)} · total FOB {compact.format(data.kpi.total_fob)} ·{' '}
        {nf.format(data.extended.assay_completed)} files assayed · average customs time{' '}
        {data.extended.avg_customs_days === null ? '—' : `${data.extended.avg_customs_days} days`}.
      </p>
    </div>
  );
}
