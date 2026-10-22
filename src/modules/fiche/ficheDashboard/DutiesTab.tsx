'use client';

import { Barcode, FileSpreadsheet, Globe, Landmark, ListOrdered, Percent } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { HBarChart } from '@/components/charts/Charts';
import {
  ChartCard, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { FicheDuties, HsCodeSummary } from '@/db/queries/ficheDashboardTabs';
import { exportHref, tabEndpoint, useTabData } from './useTabData';

// Duties & HS codes — what the duty is levied on, read from the fiche lines:
// each line's tariff position (HS code), origin, DDI rate and DDI in CDF.

export default function DutiesTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<FicheDuties>(active ? tabEndpoint('duties') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Landmark className="h-4 w-4" /> Duties &amp; HS Codes
        </h2>
        <a href={exportHref('hscodes')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.lines)} label="Tariff Lines" color="blue" icon={<ListOrdered />} />
        <KpiCard value={nf2.format(data.ddi_total)} label="Total DDI (CDF)" color="rose" icon={<Landmark />} />
        <KpiCard
          value={data.avg_ddi_percent === null ? '—' : `${nf2.format(data.avg_ddi_percent)}%`}
          label="Average DDI Rate"
          color="purple"
          icon={<Percent />}
          sub="Per line"
        />
        <KpiCard
          value={nf.format(data.distinct_hs)}
          label="Distinct HS Codes"
          color="teal"
          icon={<Barcode />}
          sub={data.lines_without_hs > 0 ? `${nf.format(data.lines_without_hs)} line(s) without an HS code` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Top 10 HS Codes — by DDI (CDF)" icon={<Barcode className="h-4 w-4" />}>
          <HBarChart
            items={data.hs_codes.slice(0, 10).map((h) => ({
              label: h.hs_code,
              value: h.ddi,
              note: `${nf.format(h.lines)} line${h.lines === 1 ? '' : 's'}`,
            }))}
            format={(v) => nf2.format(v)}
            emptyLabel="No fiche lines yet."
          />
        </ChartCard>
        <ChartCard title="DDI by Origin (CDF)" icon={<Globe className="h-4 w-4" />}>
          <HBarChart
            items={data.origins.slice(0, 10).map((o) => ({
              label: o.label,
              value: o.ddi,
              note: `${nf.format(o.lines)} line${o.lines === 1 ? '' : 's'}`,
            }))}
            format={(v) => nf2.format(v)}
            emptyLabel="No fiche lines yet."
          />
        </ChartCard>
      </div>

      <Group title="HS Codes" hint={`${nf.format(data.hs_codes.length)} codes`} icon={<Barcode className="h-4 w-4" />} accentColor="teal">
        <DataTable<HsCodeSummary>
          rows={data.hs_codes}
          rowKey={(h) => h.hs_code}
          loading={loading}
          searchPlaceholder="Search HS code or tariff description..."
          emptyMessage="No fiche lines yet — the HS codes appear once a fiche is raised with its tariff lines."
          exportHref={exportHref('hscodes')}
          columns={[
            { key: 'hs_code', header: 'HS Code', sortable: true, className: 'font-mono' },
            {
              key: 'description',
              header: 'Tariff Description',
              sortable: true,
              render: (h) => <span className="block max-w-md truncate" title={h.description ?? undefined}>{h.description ?? '—'}</span>,
            },
            { key: 'lines', header: 'Lines', align: 'right', sortable: true },
            { key: 'fiches', header: 'Fiches', align: 'right', sortable: true },
            {
              key: 'avg_ddi_percent',
              header: 'Average DDI %',
              align: 'right',
              sortable: true,
              render: (h) => `${nf2.format(h.avg_ddi_percent)}%`,
            },
            {
              key: 'ddi',
              header: 'DDI (CDF)',
              align: 'right',
              sortable: true,
              render: (h) => <strong className="text-foreground">{nf2.format(h.ddi)}</strong>,
            },
          ]}
        />
      </Group>
    </div>
  );
}
