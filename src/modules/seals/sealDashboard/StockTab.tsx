'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Boxes, CheckCircle2, ChartBar, Coins, FileSpreadsheet, Filter, MapPin, PackageCheck,
  PackageOpen, ShieldAlert, ShieldCheck, Tag, X,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, StackedBars } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, SummaryAlert, TabError, TabSkeleton, nf,
} from '@/modules/tracking/dashboardUi';
import type { OfficeStock, SealRow, SealStatus, SealStock } from '@/db/queries/sealDashboardTabs';
import { batchHref, exportHref, tabEndpoint, usd, useTabData } from './useTabData';

// Stock overview — what is on the shelf, where, and how fast it is going.
//
// The status cards are CONTROLS: clicking one narrows the seal list to exactly
// the seals it counted (§4.29). Both read the same live register, so a card and
// the rows it reveals cannot disagree.

const STATUS_CARDS: Array<{ value: SealStatus; color: string; icon: React.ReactNode; count: (d: SealStock) => number }> = [
  { value: 'Available', color: 'emerald', icon: <CheckCircle2 />, count: (d) => d.kpi.available },
  { value: 'Used', color: 'violet', icon: <ShieldCheck />, count: (d) => d.kpi.used },
  { value: 'Damaged', color: 'rose', icon: <ShieldAlert />, count: (d) => d.kpi.damaged },
];

export default function StockTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<SealStock>(active ? tabEndpoint('stock') : null);
  const [status, setStatus] = useState<SealStatus | null>(null);

  const seals = useMemo(() => {
    const all = data?.seals ?? [];
    return status ? all.filter((s) => s.status === status) : all;
  }, [data, status]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={3} /> : null;

  const { kpi, offices, monthly, low_stock_threshold: threshold } = data;
  const low = offices.filter((o) => o.low_stock);
  const notRegistered = Math.max(0, kpi.purchased - kpi.registered);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Boxes className="h-4 w-4" /> Stock Overview
        </h2>
        <a href={exportHref('offices')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Stock by Office
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          value={nf.format(kpi.purchased)}
          label="Seals Purchased"
          color="blue"
          icon={<Tag />}
          sub={`${nf.format(kpi.registered)} registered${notRegistered > 0 ? ` · ${nf.format(notRegistered)} not yet entered` : ''}`}
        />
        {STATUS_CARDS.map((c) => (
          <KpiCard
            key={c.value}
            value={nf.format(c.count(data))}
            label={`${c.value} Seals`}
            color={c.color}
            icon={c.icon}
            sub={kpi.registered > 0 ? `${Math.round((c.count(data) / kpi.registered) * 100)}% of registered` : undefined}
            onClick={() => setStatus((s) => (s === c.value ? null : c.value))}
            active={status === c.value}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.registered)} label="Seals Registered" color="sky" icon={<PackageCheck />} />
        <KpiCard value={nf.format(kpi.batches)} label="Batches" color="purple" icon={<PackageOpen />} />
        <KpiCard value={usd(kpi.spend_usd)} label="Total Purchase Spend" color="green" icon={<Coins />} />
        <KpiCard
          value={nf.format(low.length)}
          label="Offices Low on Seals"
          color={low.length > 0 ? 'amber' : 'teal'}
          icon={<AlertTriangle />}
          sub={`Fewer than ${nf.format(threshold)} available`}
        />
      </div>

      {low.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Low seal stock — reorder before the next export files
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {low.map((o) => (
              <li key={o.office_name}>
                <strong>{o.office_name}</strong>: {nf.format(o.available)} available (threshold {nf.format(threshold)})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        offices.length > 0 && (
          <SummaryAlert
            value={offices.length}
            label={`office${offices.length === 1 ? '' : 's'} stocking seals — every one has at least ${nf.format(threshold)} available.`}
            tone="success"
          />
        )
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Seals Purchased vs Used (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
          {monthly.every((m) => m.purchased === 0 && m.used === 0) ? (
            <Empty>No seals bought or put on an export file in the last twelve months.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <BarChart
                  labels={monthly.map((m) => m.month_short)}
                  series={[
                    { label: 'Purchased (batch date)', values: monthly.map((m) => m.purchased) },
                    { label: 'Used (export file date)', values: monthly.map((m) => m.used) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Stock per Office" icon={<MapPin className="h-4 w-4" />}>
          <StackedBars
            groups={offices.map((o) => ({
              label: o.office_name,
              segments: [
                { label: 'Available', value: o.available },
                { label: 'Used', value: o.used },
                { label: 'Damaged', value: o.damaged },
              ],
            }))}
            format={(v) => nf.format(v)}
            emptyLabel="No office has registered seal numbers yet — add a batch and its seal numbers from Seals."
          />
        </ChartCard>
      </div>

      <Group title="Stock by Office" hint={`${nf.format(offices.length)} offices`} icon={<MapPin className="h-4 w-4" />} accentColor="teal">
        <DataTable<OfficeStock>
          rows={offices}
          rowKey={(o) => o.office_id ?? 0}
          loading={loading}
          searchPlaceholder="Search office..."
          emptyMessage="No seal batches yet — add the first one from Seals."
          exportHref={exportHref('offices')}
          columns={[
            { key: 'office_name', header: 'Office', sortable: true },
            { key: 'batches', header: 'Batches', align: 'right', sortable: true },
            { key: 'purchased', header: 'Purchased', align: 'right', sortable: true },
            { key: 'registered', header: 'Registered', align: 'right', sortable: true },
            {
              key: 'available',
              header: 'Available',
              align: 'right',
              sortable: true,
              render: (o) => <strong className="text-foreground">{nf.format(o.available)}</strong>,
            },
            { key: 'used', header: 'Used', align: 'right', sortable: true },
            { key: 'damaged', header: 'Damaged', align: 'right', sortable: true },
            { key: 'spend_usd', header: 'Spend', align: 'right', sortable: true, render: (o) => usd(o.spend_usd) },
            {
              key: 'low_stock',
              header: 'Stock',
              value: (o) => (o.low_stock ? 'Low stock' : 'Sufficient'),
              render: (o) => (
                <StatusBadge status={o.low_stock ? 'Low stock' : 'Sufficient'} tone={o.low_stock ? 'amber' : 'emerald'} />
              ),
            },
          ]}
        />
      </Group>

      <Group
        title="Seal Register"
        hint={`${nf.format(seals.length)} of ${nf.format(data.seals.length)} shown`}
        icon={<Boxes className="h-4 w-4" />}
        accentColor="blue"
      >
        {status && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {status} — {nf.format(seals.length)} seal{seals.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setStatus(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}
        <DataTable<SealRow>
          rows={seals}
          rowKey={(s) => s.id}
          loading={loading}
          searchPlaceholder="Search seal number, status, office, export file..."
          emptyMessage={
            status
              ? `No ${status.toLowerCase()} seals — clear the filter to see the rest.`
              : 'No seal numbers registered yet — open a batch from Seals and add its numbers.'
          }
          exportHref={exportHref('seals')}
          columns={[
            { key: 'seal_number', header: 'Seal Number', sortable: true, className: 'font-mono' },
            { key: 'status', header: 'Status', sortable: true, badge: true },
            { key: 'office_name', header: 'Office', sortable: true },
            { key: 'batch_id', header: 'Batch #', align: 'right', sortable: true },
            { key: 'purchase_date', header: 'Purchase Date', sortable: true, render: (s) => formatDate(s.purchase_date) },
            {
              key: 'files',
              header: 'Export Files',
              sortable: true,
              render: (s) =>
                s.files ? (
                  <span className={s.file_count > 1 ? 'font-semibold text-destructive' : undefined} title={s.files}>
                    {s.files}
                  </span>
                ) : (
                  '—'
                ),
            },
            { key: 'updated_on', header: 'Last Changed', sortable: true, defaultHidden: true, render: (s) => formatDate(s.updated_on) },
            { key: 'notes', header: 'Notes', defaultHidden: true },
          ]}
          actions={(s) => ({ edit: batchHref(s.batch_id) })}
        />
      </Group>
    </div>
  );
}
