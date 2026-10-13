'use client';

import {
  CalendarClock, CalendarX, ChartPie, Clock, FileSpreadsheet, Filter, ShieldCheck,
  TriangleAlert, X,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { DonutChart, HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf,
} from '@/modules/tracking/dashboardUi';
import { useLicenseFilter, type FilterKind } from './useLicenseFilter';
import { exportHref, tabEndpoint, useTabData, type LicenseUseForValue } from './useTabData';
import type { LicenseExpiry, LicenseExpiryRow } from '@/db/queries/licenseDashboardTabs';

// Expiry Analysis — what lapses next, and how soon.
//
// The upload's four cards, in its order and hues. They narrow the table the
// same way the Overview's do, from the same hook: a band is a band wherever it
// is counted (§4.10). The table is ordered by expiry ascending in SQL, so the
// row that needs acting on first is at the top before anyone touches a sort.

const CARDS: Array<{
  kind: FilterKind;
  value: string;
  label: string;
  count: (k: LicenseExpiry['kpi']) => number;
  color: string;
  icon: React.ReactNode;
}> = [
  { kind: 'expiry', value: 'Valid', label: 'Valid Licenses', count: (k) => k.valid, color: 'green', icon: <ShieldCheck /> },
  { kind: 'expiry', value: 'Expiring7', label: 'Expiring in 7 Days', count: (k) => k.expiring_7, color: 'orange', icon: <TriangleAlert /> },
  { kind: 'expiry', value: 'Expiring30', label: 'Expiring in 30 Days', count: (k) => k.expiring_30, color: 'cyan', icon: <Clock /> },
  { kind: 'expiry', value: 'Expired', label: 'Expired Licenses', count: (k) => k.expired, color: 'red', icon: <CalendarX /> },
];

/** The hue each band's day count carries, so the table reads like the cards. */
const BAND_CLASS: Record<string, string> = {
  Expired: 'font-semibold text-rose-600 dark:text-rose-400',
  Expiring7: 'font-semibold text-rose-600 dark:text-rose-400',
  Expiring15: 'font-semibold text-amber-600 dark:text-amber-400',
  Expiring30: 'text-sky-700 dark:text-sky-300',
  Valid: 'text-emerald-700 dark:text-emerald-400',
};

export default function ExpiryTab({
  active,
  useFor,
  basePath,
}: {
  active: boolean;
  useFor: LicenseUseForValue;
  basePath: string;
}) {
  const { data, loading, error } = useTabData<LicenseExpiry>(
    active ? tabEndpoint('expiry', useFor) : null,
  );
  const f = useLicenseFilter<LicenseExpiryRow>(data?.rows ?? []);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const { kpi } = data;

  // Disjoint bands, so these add up to the total — the cards above are
  // cumulative, which is the other, deliberate reading of the same data.
  const bands = [
    { label: 'Expired', value: kpi.expired },
    { label: 'Expiring in 7 Days', value: kpi.expiring_7 },
    { label: 'Expiring in 15 Days', value: Math.max(kpi.expiring_15 - kpi.expiring_7, 0) },
    { label: 'Expiring in 30 Days', value: Math.max(kpi.expiring_30 - kpi.expiring_15, 0) },
    { label: 'Valid', value: Math.max(kpi.valid - kpi.expiring_30, 0) },
  ].filter((b) => b.value > 0);

  /** Which clients carry the most lapsing licences — who to call first. */
  const byClient = new Map<string, number>();
  for (const r of data.rows) {
    if (r.expiry_flag === 'Valid') continue;
    const key = r.client_name ?? 'Not Specified';
    byClient.set(key, (byClient.get(key) ?? 0) + 1);
  }
  const atRisk = [...byClient.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <CalendarClock className="h-4 w-4" /> Expiry Analysis
        </h2>
        <a href={exportHref({ scope: 'expiry', use_for: useFor })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CARDS.map((c) => (
          <KpiCard
            key={c.value}
            value={nf.format(c.count(kpi))}
            label={c.label}
            color={c.color}
            icon={c.icon}
            onClick={() => f.toggle(c.kind, c.value, c.label)}
            active={f.isActive(c.kind, c.value)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Expiry Distribution" icon={<ChartPie className="h-4 w-4" />}>
          {bands.length === 0 ? (
            <Empty>No licences carry an expiry date yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart slices={bands} size={220} thickness={44} format={(v) => nf.format(v)} />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Clients With Licences Lapsing" icon={<TriangleAlert className="h-4 w-4" />}>
          <HBarChart
            items={atRisk}
            format={(v) => nf.format(v)}
            emptyLabel="Nothing is lapsing within 30 days."
          />
        </ChartCard>
      </div>

      <Group
        title="Complete Expiry Analysis"
        hint="Soonest first — the row at the top is the one to act on"
        icon={<CalendarClock className="h-4 w-4" />}
        accentColor="orange"
      >
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

        <DataTable<LicenseExpiryRow>
          rows={f.rows}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search licence #, client, bank, category..."
          emptyMessage={
            f.filter
              ? 'No licences in that band — clear the filter to see the rest.'
              : 'No licences carry an expiry date yet.'
          }
          exportHref={exportHref({ scope: 'expiry', use_for: useFor })}
          columns={[
            { key: 'license_number', header: 'License #', sortable: true },
            { key: 'client_name', header: 'Client', sortable: true },
            { key: 'bank_name', header: 'Bank', sortable: true },
            {
              key: 'license_applied_date',
              header: 'Applied Date',
              sortable: true,
              render: (r) => formatDate(r.license_applied_date),
            },
            {
              key: 'license_expiry_date',
              header: 'Expiry Date',
              sortable: true,
              render: (r) => formatDate(r.license_expiry_date),
            },
            {
              key: 'days_to_expiry',
              header: 'Days to Expiry',
              align: 'right',
              sortable: true,
              // A lapsed licence reads as "12 days overdue", not "-12": the
              // minus sign is the only thing distinguishing the two states and
              // it is one glyph wide in a column being scanned.
              render: (r) =>
                r.days_to_expiry === null ? (
                  '—'
                ) : (
                  <span className={BAND_CLASS[r.expiry_flag] ?? 'text-foreground'}>
                    {r.days_to_expiry < 0
                      ? `${nf.format(Math.abs(r.days_to_expiry))} days overdue`
                      : `${nf.format(r.days_to_expiry)} days`}
                  </span>
                ),
            },
            { key: 'expiry_category', header: 'Category', sortable: true, badge: true },
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
