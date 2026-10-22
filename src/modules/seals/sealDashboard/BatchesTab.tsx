'use client';

import { Coins, FileSpreadsheet, MapPin, PackageOpen, Percent, Tag } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartCard, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { BatchRow, SealBatches } from '@/db/queries/sealDashboardTabs';
import { batchHref, exportHref, tabEndpoint, usd, useTabData } from './useTabData';

// Batches — what each purchase bought, what it cost, and how much of it is gone.

const batchLabel = (b: BatchRow): string =>
  `#${b.id} · ${b.office_name}${b.purchase_date ? ` · ${formatDate(b.purchase_date)}` : ''}`;

export default function BatchesTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<SealBatches>(active ? tabEndpoint('batches') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const { kpi, batches, offices } = data;
  const byCost = [...batches].sort((a, b) => b.total_amount - a.total_amount).slice(0, 10);
  const used = kpi.registered > 0 ? (kpi.used / kpi.registered) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <PackageOpen className="h-4 w-4" /> Purchase Batches
        </h2>
        <a href={exportHref('batches')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.batches)} label="Batches" color="purple" icon={<PackageOpen />} />
        <KpiCard value={usd(kpi.spend_usd)} label="Total Spend" color="green" icon={<Coins />} />
        <KpiCard
          value={usd(kpi.avg_cost_per_seal)}
          label="Average Cost per Seal"
          color="sky"
          icon={<Tag />}
          sub={`${nf.format(kpi.purchased)} seals purchased`}
        />
        <KpiCard
          value={kpi.registered > 0 ? `${nf2.format(used)}%` : '—'}
          label="Registered Seals Used"
          color="violet"
          icon={<Percent />}
          sub={`${nf.format(kpi.used)} of ${nf.format(kpi.registered)} registered`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Top 10 Batches — by cost" icon={<Coins className="h-4 w-4" />}>
          <HBarChart
            items={byCost.map((b) => ({
              label: batchLabel(b),
              value: b.total_amount,
              note: `${nf.format(b.total_seal)} seals · ${nf2.format(b.used_pct)}% used`,
            }))}
            format={usd}
            emptyLabel="No seal batches yet — add the first one from Seals."
          />
        </ChartCard>
        <ChartCard title="Spend per Office" icon={<MapPin className="h-4 w-4" />}>
          <HBarChart
            items={offices.map((o) => ({
              label: o.office_name,
              value: o.spend_usd,
              note: `${nf.format(o.batches)} batch${o.batches === 1 ? '' : 'es'} · ${nf.format(o.purchased)} seals`,
            }))}
            format={usd}
            emptyLabel="No office has bought seals yet."
          />
        </ChartCard>
      </div>

      <Group title="All Batches" hint={`${nf.format(batches.length)} batches`} icon={<PackageOpen className="h-4 w-4" />} accentColor="purple">
        <DataTable<BatchRow>
          rows={batches}
          rowKey={(b) => b.id}
          loading={loading}
          searchPlaceholder="Search batch, office, sub office, purchase date..."
          emptyMessage="No seal batches yet — add the first one from Seals."
          exportHref={exportHref('batches')}
          columns={[
            { key: 'id', header: 'Batch #', align: 'right', sortable: true },
            { key: 'purchase_date', header: 'Purchase Date', sortable: true, render: (b) => formatDate(b.purchase_date) },
            { key: 'office_name', header: 'Office', sortable: true },
            { key: 'sub_office_code', header: 'Sub Office', sortable: true, defaultHidden: true },
            { key: 'total_seal', header: 'Total Seals', align: 'right', sortable: true },
            {
              key: 'total_amount',
              header: 'Cost',
              align: 'right',
              sortable: true,
              render: (b) => <strong className="text-foreground">{usd(b.total_amount)}</strong>,
            },
            { key: 'cost_per_seal', header: 'Cost / Seal', align: 'right', sortable: true, render: (b) => usd(b.cost_per_seal) },
            { key: 'registered', header: 'Registered', align: 'right', sortable: true },
            { key: 'available', header: 'Available', align: 'right', sortable: true },
            { key: 'used', header: 'Used', align: 'right', sortable: true },
            { key: 'damaged', header: 'Damaged', align: 'right', sortable: true },
            { key: 'used_pct', header: '% Used', align: 'right', sortable: true, render: (b) => `${nf2.format(b.used_pct)}%` },
          ]}
          actions={(b) => ({ edit: batchHref(b.id) })}
        />
      </Group>
    </div>
  );
}
