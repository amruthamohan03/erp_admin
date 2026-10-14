'use client';

import { useMemo, useState } from 'react';
import {
  Banknote, ChartBar, ChartPie, Coins, Crown, FileSpreadsheet, Filter, Layers, Percent,
  Scale, TrendingUp, X,
} from 'lucide-react';
import { DonutChart, HBarChart } from '@/components/charts/Charts';
import {
  ChartCard, Empty, GridTable, Group, KpiCard, TabError, TabSkeleton, Td, Th, Tr, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import { formatDate } from '@/lib/formatDate';
import { QuotationTable } from './OverviewTab';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { QuotationValue, ValueBand } from '@/db/queries/quotationDashboardTabs';

// Value Analysis — where the money is.
//
// The Overview answers "how many"; this tab answers "how much, and is it spread
// or concentrated". The bands are DISJOINT, so they add up to the total — a
// quotation sits in exactly one — which is why a card here filters to its own
// band rather than widening like the Licence dashboard's cumulative cards do.

const BANDS: Array<{ band: ValueBand; label: string; color: string }> = [
  { band: 'ZERO', label: 'Zero / unpriced', color: 'slate' },
  { band: 'UNDER_1K', label: 'Under $1,000', color: 'sky' },
  { band: 'B1K_5K', label: '$1,000 – $5,000', color: 'teal' },
  { band: 'B5K_20K', label: '$5,000 – $20,000', color: 'amber' },
  { band: 'B20K_50K', label: '$20,000 – $50,000', color: 'orange' },
  { band: 'OVER_50K', label: 'Over $50,000', color: 'rose' },
];

const usd = (n: number): string => `$${nf2.format(n)}`;

export default function ValueTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<QuotationValue>(
    active ? tabEndpoint('value') : null,
  );
  const [band, setBand] = useState<{ band: ValueBand; label: string } | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return band ? all.filter((r) => r.value_band === band.band) : all;
  }, [data, band]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={3} /> : null;

  const { kpi } = data;
  const byBand = new Map(data.bands.map((b) => [b.band, b]));
  const present = BANDS.map((b) => ({ ...b, ...(byBand.get(b.band) ?? { count: 0, value_usd: 0 }) }));

  // What the total is MADE OF. Sub total + VAT + ARSP is the total, so these
  // are parts of one whole and a donut is the honest shape for them.
  const composition = [
    { label: 'Sub Total', value: kpi.sub_total_usd },
    { label: 'VAT', value: kpi.vat_usd },
    { label: 'ARSP', value: kpi.arsp_usd },
  ].filter((c) => c.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Coins className="h-4 w-4" /> Value Analysis
        </h2>
        <a href={exportHref({ scope: 'quotations' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={usd(kpi.total_usd)} label="Total Value (USD)" color="green" icon={<Coins />} />
        <KpiCard value={usd(kpi.sub_total_usd)} label="Sub Total" color="sky" icon={<Layers />} />
        <KpiCard value={usd(kpi.vat_usd)} label="VAT" color="amber" icon={<Percent />} />
        <KpiCard value={usd(kpi.arsp_usd)} label="ARSP" color="rose" icon={<Percent />} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={usd(kpi.avg_usd)} label="Average Quotation" color="purple" icon={<ChartBar />} />
        {/* The median beside the mean, because one large quotation drags the
            average away from every actual document in the book. */}
        <KpiCard value={usd(kpi.median_usd)} label="Median Quotation" color="violet" icon={<Scale />} />
        <KpiCard value={usd(kpi.max_usd)} label="Largest Quotation" color="dark" icon={<Crown />} />
        <KpiCard
          value={kpi.total_cdf > 0 ? nf2.format(kpi.total_cdf) : '—'}
          label="Total Value (CDF)"
          color="slate"
          icon={<Banknote />}
        />
      </div>

      <Group
        title="Value Bands"
        hint="Disjoint — every quotation sits in exactly one, so the bands add up to the total"
        icon={<TrendingUp className="h-4 w-4" />}
        accentColor="emerald"
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {present.map((b) => (
            <KpiCard
              key={b.band}
              value={nf.format(b.count)}
              label={b.label}
              color={b.color}
              icon={<Coins />}
              sub={usd(b.value_usd)}
              onClick={() =>
                setBand((p) => (p?.band === b.band ? null : { band: b.band, label: b.label }))
              }
              active={band?.band === b.band}
            />
          ))}
        </div>
      </Group>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="What the total is made of" icon={<ChartPie className="h-4 w-4" />}>
          {composition.length === 0 ? (
            <Empty>Nothing priced yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart slices={composition} size={220} thickness={44} format={(v) => usd(v)} />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Value by band" icon={<ChartBar className="h-4 w-4" />}>
          <HBarChart
            items={present
              .filter((b) => b.value_usd > 0)
              .map((b) => ({
                label: b.label,
                value: b.value_usd,
                note: `${nf.format(b.count)} quotation${b.count === 1 ? '' : 's'}`,
              }))}
            format={(v) => usd(v)}
            emptyLabel="Nothing priced yet."
          />
        </ChartCard>
      </div>

      <Group title="Largest Quotations" icon={<Crown className="h-4 w-4" />} accentColor="amber">
        {data.top.length === 0 ? (
          <ChartCard><Empty>No quotations yet.</Empty></ChartCard>
        ) : (
          <ChartCard>
            <GridTable
              head={
                <tr>
                  <Th align="left">Quotation Ref</Th>
                  <Th align="left">Client</Th>
                  <Th>Date</Th>
                  <Th>Lines</Th>
                  <Th align="right">Sub Total</Th>
                  <Th align="right">VAT</Th>
                  <Th align="right">Total (USD)</Th>
                </tr>
              }
            >
              {data.top.map((r) => (
                <Tr key={r.id}>
                  <Td align="left">{r.quotation_ref ?? '—'}</Td>
                  <Td align="left">{r.client_name ?? '—'}</Td>
                  <Td>{formatDate(r.quotation_date)}</Td>
                  <Td>{nf.format(r.line_count)}</Td>
                  <Td align="right">{nf2.format(r.sub_total)}</Td>
                  <Td align="right">{nf2.format(r.vat_amount)}</Td>
                  <Td align="right">
                    <strong>{nf2.format(r.total_amount)}</strong>
                  </Td>
                </Tr>
              ))}
            </GridTable>
          </ChartCard>
        )}
      </Group>

      <Group
        title="Quotations by Value"
        hint={`${nf.format(rows.length)} of ${nf.format(data.rows.length)} shown, largest first`}
        icon={<Coins className="h-4 w-4" />}
        accentColor="green"
      >
        {band && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: {band.label} — {nf.format(rows.length)} quotation
              {rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setBand(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}

        <QuotationTable rows={rows} loading={loading} filtered={band !== null} />
      </Group>
    </div>
  );
}
