'use client';

import { useState } from 'react';
import { Building, Clock, Import, Landmark, MapPin, CircleCheck } from 'lucide-react';
import { DonutChart } from '@/components/charts/Charts';
import {
  ChartCard,
  ChartTypeSelector,
  Empty,
  GridTable,
  KpiCard,
  SectionHeader,
  TabError,
  TabSkeleton,
  Td,
  Th,
  Tr,
  nf,
} from '../dashboardUi';
import { tabEndpoint, useTabData } from './useTabData';
import type { ImportOffices } from '@/db/queries/importDashboardTabs';

// Declaration Office — how the declaring offices compare.
//
// Clearance time is measured DGDA In to DGDA Out, which is the span the office
// itself controls; the file's whole life belongs to the delay KPI screen. Files
// with no declaration office are excluded throughout, so a rate is never
// diluted by work no office was responsible for.

const OFFICE_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'teal', 'indigo', 'pink'];

const CHART_TYPES = [
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
] as const;

type ChartType = (typeof CHART_TYPES)[number]['value'];

export default function OfficesTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ImportOffices>(active ? tabEndpoint('offices') : null);
  const [chartType, setChartType] = useState<ChartType>('pie');

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Declaration Office Analysis"
        hint="Files by declaring office, and how quickly each clears them (DGDA In to DGDA Out)"
        icon={<MapPin className="h-4 w-4" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.offices)} label="Offices" color="blue" icon={<Building />} />
        <KpiCard value={nf.format(data.files)} label="Total" sub="Files with an office set" color="cyan" icon={<Import />} />
        <KpiCard value={nf.format(data.completed)} label="Cleared" color="green" icon={<CircleCheck />} />
        <KpiCard
          value={data.avg_clearance_days === null ? '—' : data.avg_clearance_days.toFixed(1)}
          label="Avg Days"
          sub="DGDA In to DGDA Out"
          color="orange"
          icon={<Clock />}
        />
      </div>

      {data.rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((o, i) => (
            <KpiCard
              key={o.office_name ?? 'none'}
              value={nf.format(o.files)}
              label={o.office_name ?? 'Not Specified'}
              sub={`${nf.format(o.completed)} cleared · ${nf.format(o.in_progress)} in progress`}
              color={OFFICE_COLORS[i % OFFICE_COLORS.length]}
              icon={<Landmark />}
            />
          ))}
        </div>
      )}

      <ChartCard title="Office Distribution">
        <ChartTypeSelector value={chartType} onChange={setChartType} options={CHART_TYPES} />
        {data.rows.length === 0 ? (
          <Empty>No files carry a declaration office yet.</Empty>
        ) : (
          <div className="flex justify-center">
            <DonutChart
              slices={data.rows.map((o) => ({ label: o.office_name ?? 'Not Specified', value: o.files }))}
              size={230}
              // A pie is a donut with no hole, so the design's two shapes come
              // from one component rather than two charts to keep in step.
              thickness={chartType === 'pie' ? 130 : 44}
              format={(v) => nf.format(v)}
            />
          </div>
        )}
      </ChartCard>

      <ChartCard title="Office Performance">
        {data.rows.length === 0 ? (
          <Empty>No files carry a declaration office yet — set one on an import to see it here.</Empty>
        ) : (
          <GridTable
            head={
              <tr>
                <Th align="left">Office</Th>
                <Th>Total</Th>
                <Th>Cleared</Th>
                <Th>Rate</Th>
                <Th>Avg Days</Th>
              </tr>
            }
          >
            {[...data.rows]
              .sort((a, b) => b.clearance_rate - a.clearance_rate)
              .map((o) => (
                <Tr key={o.office_name ?? 'none'}>
                  <Td align="left"><strong>{o.office_name ?? '—'}</strong></Td>
                  <Td>{nf.format(o.files)}</Td>
                  <Td>
                    <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                      {nf.format(o.completed)}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex h-[18px] w-full overflow-hidden rounded bg-muted">
                      <span
                        className="flex items-center justify-center bg-emerald-500 text-[10px] font-bold text-white"
                        style={{
                          width: `${o.clearance_rate}%`,
                          minWidth: o.clearance_rate > 0 ? '2.5rem' : 0,
                        }}
                      >
                        {o.clearance_rate > 0 ? `${o.clearance_rate.toFixed(1)}%` : ''}
                      </span>
                    </span>
                  </Td>
                  {/* An em dash, not 0.0: no office cleared a file in zero days —
                      no file there has both DGDA dates recorded yet. */}
                  <Td>{o.avg_clearance_days === null ? '—' : o.avg_clearance_days.toFixed(1)}</Td>
                </Tr>
              ))}
          </GridTable>
        )}
      </ChartCard>
    </div>
  );
}
