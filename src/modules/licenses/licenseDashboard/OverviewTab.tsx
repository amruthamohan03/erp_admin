'use client';

import {
  Banknote, CalendarCheck, CalendarCheck2, CalendarClock, CalendarDays, CalendarRange,
  CalendarX, ChartArea, ChartBar, ChartPie, CircleCheck, FileSpreadsheet, FileText, Filter,
  Landmark, MapPin, Package, RefreshCw, ShieldCheck, Ship, TriangleAlert, Users, X, XCircle,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { ComboChart, DonutChart, HBarChart, RadialGauge } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf,
} from '@/modules/tracking/dashboardUi';
import { useLicenseFilter, type FilterKind } from './useLicenseFilter';
import { exportHref, tabEndpoint, useTabData, type LicenseUseForValue } from './useTabData';
import type { LicenseOverview, LicenseRow } from '@/db/queries/licenseDashboardTabs';

// Overview — the uploaded Licence dashboard's main tab, section for section:
// the same twelve filtering cards in the same three rows, the two context
// cards under them, then the eight charts in the upload's pairing, and the
// All Licences table with its filter indicator above it.
//
// Its distinctive interaction: a card is a CONTROL. Clicking "Expiring in 15
// Days" narrows the table at the foot of the page to exactly the rows that card
// counted, and clicking it again clears the filter. The upload did this with a
// DataTables regex over three hidden columns; here the bands come from SQL with
// each row (§4.29), so the figure and the rows it reveals are counted by one
// rule rather than two.

interface CardDef {
  kind: FilterKind;
  value: string;
  label: string;
  count: (k: LicenseOverview['kpi']) => number;
  color: string;
  icon: React.ReactNode;
}

/** Row 1 — the book at a glance. The empty value is the clear-all card. */
const ROW_1: CardDef[] = [
  { kind: 'status', value: '', label: 'Total Licenses', count: (k) => k.total, color: 'blue', icon: <FileText /> },
  { kind: 'status', value: 'ACTIVE', label: 'Active Licenses', count: (k) => k.active, color: 'green', icon: <CircleCheck /> },
  { kind: 'expiry', value: 'Valid', label: 'Valid Licenses', count: (k) => k.valid, color: 'purple', icon: <ShieldCheck /> },
  { kind: 'expiry', value: 'Expired', label: 'Expired Licenses', count: (k) => k.expired, color: 'red', icon: <CalendarX /> },
];

/** Row 2 — when the licence was applied for. Cumulative, by design. */
const ROW_2: CardDef[] = [
  { kind: 'period', value: 'TODAY', label: "Today's Licenses", count: (k) => k.today, color: 'orange', icon: <CalendarDays /> },
  { kind: 'period', value: 'THISWEEK', label: 'This Week', count: (k) => k.this_week, color: 'teal', icon: <CalendarRange /> },
  { kind: 'period', value: 'THISMONTH', label: 'This Month', count: (k) => k.this_month, color: 'cyan', icon: <CalendarCheck2 /> },
  { kind: 'period', value: 'THISYEAR', label: 'This Year', count: (k) => k.this_year, color: 'indigo', icon: <CalendarCheck /> },
];

/** Row 3 — the states that need somebody to look at them. */
const ROW_3: CardDef[] = [
  { kind: 'status', value: 'MODIFIED', label: 'Modified Licenses', count: (k) => k.modified, color: 'lime', icon: <RefreshCw /> },
  { kind: 'status', value: 'ANNULATED', label: 'Annulated Licenses', count: (k) => k.annulated, color: 'pink', icon: <XCircle /> },
  { kind: 'status', value: 'PROROGATED', label: 'Prorogated Licenses', count: (k) => k.prorogated, color: 'purple', icon: <CalendarClock /> },
  { kind: 'expiry', value: 'Expiring15', label: 'Expiring in 15 Days', count: (k) => k.expiring_15, color: 'orange', icon: <TriangleAlert /> },
];

export default function OverviewTab({
  active,
  useFor,
  basePath,
}: {
  active: boolean;
  useFor: LicenseUseForValue;
  basePath: string;
}) {
  const { data, loading, error } = useTabData<LicenseOverview>(
    active ? tabEndpoint('overview', useFor) : null,
  );
  // Called unconditionally — the rows are empty until the fetch settles, which
  // is the hook rule and also the right reading: no rows, nothing to narrow.
  const f = useLicenseFilter<LicenseRow>(data?.rows ?? []);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={6} panels={3} /> : null;

  const { kpi } = data;

  const card = (c: CardDef) => (
    <KpiCard
      key={`${c.kind}-${c.value || 'all'}`}
      value={nf.format(c.count(kpi))}
      label={c.label}
      color={c.color}
      icon={c.icon}
      // The Total card names no band of its own — it clears whatever is on.
      onClick={c.value === '' ? f.clear : () => f.toggle(c.kind, c.value, c.label)}
      active={c.value === '' ? f.filter === null : f.isActive(c.kind, c.value)}
    />
  );

  // The upload's trend is a column per month with a cumulative line over it —
  // the running total is what makes a quiet month legible as a flattening
  // rather than just a short bar.
  let running = 0;
  const cumulative = data.monthly.map((m) => {
    running += m.count;
    return running;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ChartArea className="h-4 w-4" /> Overview Analytics
        </h2>
        <a href={exportHref({ scope: 'licenses', use_for: useFor })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{ROW_1.map(card)}</div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{ROW_2.map(card)}</div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{ROW_3.map(card)}</div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Neither of these names a band, so neither filters — they are
            context for the rows above, not a control that does nothing. */}
        <KpiCard value={nf.format(kpi.unique_clients)} label="Unique Clients" color="blue" icon={<Users />} />
        <KpiCard value={nf.format(kpi.unique_banks)} label="Unique Banks" color="indigo" icon={<Landmark />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Status Distribution" icon={<ChartPie className="h-4 w-4" />}>
          {data.status.length === 0 ? (
            <Empty>No licences carry a status yet.</Empty>
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

        <ChartCard title="Expiry Status" icon={<ShieldCheck className="h-4 w-4" />}>
          {kpi.total === 0 ? (
            <Empty>No licences yet.</Empty>
          ) : (
            <div className="flex justify-center">
              {/* Concentric shares of one book, not a breakdown: a licence
                  expiring in 30 days is also still valid, so these overlap
                  and must not be drawn as slices that add up. */}
              <RadialGauge
                total={kpi.total}
                tracks={[
                  { label: 'Valid', value: kpi.valid },
                  { label: 'Expiring within 30 days', value: kpi.expiring_30 },
                  { label: 'Expired', value: kpi.expired },
                ]}
                size={220}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Monthly License Trend"
          icon={<ChartBar className="h-4 w-4" />}
        >
          {kpi.total === 0 ? (
            <Empty>No licences yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <ComboChart
                  labels={data.monthly.map((m) => m.month_short)}
                  columns={{ label: 'Licences', values: data.monthly.map((m) => m.count) }}
                  line={{ label: 'Cumulative', values: cumulative }}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Top 5 Banks" icon={<Landmark className="h-4 w-4" />}>
          <HBarChart
            items={data.banks.slice(0, 5).map((b) => ({ label: b.label, value: b.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No licences name a bank yet."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Type of Goods Distribution" icon={<Package className="h-4 w-4" />}>
          <HBarChart
            items={data.goods.map((g) => ({ label: g.label, value: g.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No licences name a type of goods yet."
          />
        </ChartCard>

        <ChartCard title="Transport Mode Analysis" icon={<Ship className="h-4 w-4" />}>
          {data.transport.length === 0 ? (
            <Empty>No licences name a transport mode yet.</Empty>
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
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Currency Distribution" icon={<Banknote className="h-4 w-4" />}>
          {data.currency.length === 0 ? (
            <Empty>No licences name a currency yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.currency.map((c) => ({ label: c.label, value: c.count }))}
                size={200}
                thickness={100}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Entry Point Distribution" icon={<MapPin className="h-4 w-4" />}>
          <HBarChart
            items={data.entry_post.map((e) => ({ label: e.label, value: e.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No licences name an entry post yet."
          />
        </ChartCard>
      </div>

      <Group
        title="All Licenses"
        hint={`${nf.format(f.rows.length)} of ${nf.format(data.rows.length)} shown`}
        icon={<FileText className="h-4 w-4" />}
        accentColor="blue"
      >
        {/* The indicator says which card is doing the narrowing, and carries a
            way out that is not the card itself — a filter whose reason is off
            screen is a table that looks broken. */}
        {f.filter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {f.filter.label} — {nf.format(f.rows.length)} licence
              {f.rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={f.clear} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}

        <DataTable<LicenseRow>
          rows={f.rows}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search licence #, client, bank, invoice..."
          emptyMessage={
            f.filter
              ? 'No licences in that band — clear the filter to see the rest.'
              : 'No licences yet — create the first one from the licence list.'
          }
          exportHref={exportHref({ scope: 'licenses', use_for: useFor })}
          columns={[
            { key: 'license_number', header: 'License #', sortable: true },
            { key: 'client_name', header: 'Client', sortable: true },
            { key: 'bank_name', header: 'Bank', sortable: true },
            { key: 'invoice_number', header: 'Invoice #', sortable: true },
            {
              key: 'license_applied_date',
              header: 'Applied',
              sortable: true,
              render: (r) => formatDate(r.license_applied_date),
            },
            {
              key: 'license_expiry_date',
              header: 'Expiry',
              sortable: true,
              render: (r) => formatDate(r.license_expiry_date),
            },
            {
              key: 'days_to_expiry',
              header: 'Days Left',
              align: 'right',
              sortable: true,
              render: (r) =>
                r.days_to_expiry === null ? (
                  '—'
                ) : (
                  <span
                    className={
                      r.days_to_expiry < 0
                        ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : r.days_to_expiry <= 15
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'text-foreground'
                    }
                  >
                    {nf.format(r.days_to_expiry)}
                  </span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              render: (r) => <StatusBadge status={r.status ?? ''} />,
            },
          ]}
          actions={(row) => ({ edit: `${basePath}/${row.id}` })}
        />
      </Group>
    </div>
  );
}
