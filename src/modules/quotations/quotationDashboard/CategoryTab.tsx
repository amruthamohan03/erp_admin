'use client';

import {
  Boxes, ChartBar, ChartPie, FileSpreadsheet, Layers, Package, Percent, Ruler, ShieldCheck,
} from 'lucide-react';
import { DonutChart, HBarChart } from '@/components/charts/Charts';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ChartCard, Empty, GridTable, Group, KpiCard, TabError, TabSkeleton, Td, Th, Tr, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { QuotationCategories } from '@/db/queries/quotationDashboardTabs';

// Category Analysis — the quotation's own structure, one level down.
//
// A quotation is a header plus priced lines grouped by category, and the
// category is the load-bearing piece of configuration: `is_customs` is what
// switches a line's money columns from USD to CDF in Import-Definitive mode.
// So this tab reports per category rather than per quotation, and says which
// categories are the customs ones rather than inferring it from a name.

const usd = (n: number): string => `$${nf2.format(n)}`;

export default function CategoryTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<QuotationCategories>(
    active ? tabEndpoint('categories') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={3} /> : null;

  const { kpi } = data;
  const totalLines = data.categories.reduce((n, c) => n + c.lines, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Layers className="h-4 w-4" /> Category &amp; Item Analysis
        </h2>
        <a href={exportHref({ scope: 'categories' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.lines)} label="Total Lines" color="blue" icon={<Boxes />} />
        <KpiCard
          value={nf.format(kpi.customs_lines)}
          label="Customs Lines"
          color="violet"
          icon={<ShieldCheck />}
          sub="Priced in CDF on Import-Definitive"
        />
        <KpiCard
          value={nf.format(kpi.tva_lines)}
          label="Lines with TVA"
          color="amber"
          icon={<Percent />}
          sub={kpi.lines > 0 ? `${Math.round((kpi.tva_lines / kpi.lines) * 100)}% of all lines` : undefined}
        />
        <KpiCard value={nf.format(kpi.unique_items)} label="Unique Items" color="emerald" icon={<Package />} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={usd(kpi.value_usd)} label="Line Value (USD)" color="green" icon={<ChartBar />} />
        <KpiCard
          value={kpi.value_cdf > 0 ? nf2.format(kpi.value_cdf) : '—'}
          label="Line Value (CDF)"
          color="dark"
          icon={<ChartBar />}
        />
        <KpiCard
          value={kpi.avg_lines > 0 ? kpi.avg_lines.toFixed(1) : '—'}
          label="Average Lines per Quotation"
          color="sky"
          icon={<Layers />}
        />
        <KpiCard value={nf.format(data.categories.length)} label="Categories in Use" color="teal" icon={<Layers />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Lines by Category" icon={<ChartPie className="h-4 w-4" />}>
          {data.categories.length === 0 ? (
            <Empty>No quotation lines yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={data.categories.map((c) => ({
                  label: c.category_name ?? 'Uncategorised',
                  value: c.lines,
                }))}
                size={220}
                thickness={44}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Value by Category (USD)" icon={<ChartBar className="h-4 w-4" />}>
          <HBarChart
            items={data.categories
              .filter((c) => c.value_usd > 0)
              .map((c) => ({
                label: c.category_name ?? 'Uncategorised',
                value: c.value_usd,
                note: `${nf.format(c.lines)} line${c.lines === 1 ? '' : 's'}`,
              }))}
            format={(v) => usd(v)}
            emptyLabel="No line carries a USD value — the customs lines are priced in CDF."
          />
        </ChartCard>
      </div>

      <Group title="Categories" icon={<Layers className="h-4 w-4" />} accentColor="violet">
        {data.categories.length === 0 ? (
          <ChartCard><Empty>No quotation lines yet.</Empty></ChartCard>
        ) : (
          <ChartCard>
            <GridTable
              head={
                <tr>
                  <Th align="left">Category</Th>
                  <Th>Type</Th>
                  <Th>Lines</Th>
                  <Th>Share</Th>
                  <Th>Quotations</Th>
                  <Th>With TVA</Th>
                  <Th align="right">TVA (USD)</Th>
                  <Th align="right">Value (USD)</Th>
                  <Th align="right">Value (CDF)</Th>
                </tr>
              }
            >
              {data.categories.map((c) => (
                <Tr key={c.id ?? c.category_name}>
                  <Td align="left">{c.category_name ?? 'Uncategorised'}</Td>
                  <Td>
                    {/* The flag, not the name — `is_customs` is the only signal
                        the pricing rules read, so it is the one shown. */}
                    <StatusBadge status={c.is_customs ? 'Customs' : 'Standard'} tone={c.is_customs ? 'violet' : 'slate'} />
                  </Td>
                  <Td>{nf.format(c.lines)}</Td>
                  <Td>{totalLines > 0 ? `${Math.round((c.lines / totalLines) * 100)}%` : '—'}</Td>
                  <Td>{nf.format(c.quotations)}</Td>
                  <Td>{nf.format(c.with_tva)}</Td>
                  <Td align="right">{nf2.format(c.tva_usd)}</Td>
                  <Td align="right">{nf2.format(c.value_usd)}</Td>
                  <Td align="right">{c.value_cdf > 0 ? nf2.format(c.value_cdf) : '—'}</Td>
                </Tr>
              ))}
              <Tr tone="total">
                <Td align="left">TOTAL</Td>
                <Td />
                <Td>{nf.format(totalLines)}</Td>
                <Td>100%</Td>
                <Td />
                <Td>{nf.format(data.categories.reduce((n, c) => n + c.with_tva, 0))}</Td>
                <Td align="right">{nf2.format(data.categories.reduce((n, c) => n + c.tva_usd, 0))}</Td>
                <Td align="right">{nf2.format(data.categories.reduce((n, c) => n + c.value_usd, 0))}</Td>
                <Td align="right">{nf2.format(data.categories.reduce((n, c) => n + c.value_cdf, 0))}</Td>
              </Tr>
            </GridTable>
          </ChartCard>
        )}
      </Group>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Most Quoted Items" icon={<Package className="h-4 w-4" />}>
          {data.items.length === 0 ? (
            <Empty>No quotation lines yet.</Empty>
          ) : (
            <GridTable
              head={
                <tr>
                  <Th align="left">Item</Th>
                  <Th align="left">Category</Th>
                  <Th>Lines</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Value (USD)</Th>
                </tr>
              }
            >
              {data.items.map((i) => (
                <Tr key={`${i.item_name}-${i.category_name}`}>
                  <Td align="left" title={i.item_name ?? ''}>{i.item_name ?? '—'}</Td>
                  <Td align="left">{i.category_name ?? '—'}</Td>
                  <Td>{nf.format(i.lines)}</Td>
                  <Td align="right">{nf2.format(i.quantity)}</Td>
                  <Td align="right">{nf2.format(i.value_usd)}</Td>
                </Tr>
              ))}
            </GridTable>
          )}
        </ChartCard>

        <ChartCard title="Units" icon={<Ruler className="h-4 w-4" />}>
          <HBarChart
            items={data.units.map((u) => ({ label: u.label, value: u.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No line carries a unit yet."
          />
        </ChartCard>
      </div>
    </div>
  );
}
