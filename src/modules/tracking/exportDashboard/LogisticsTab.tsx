'use client';

import {
  Box, ChartArea, ChartPie, CircleCheck, Clock, Container, FileSpreadsheet, Flag,
  Landmark, MapPin, Route, Send, Train, Truck,
} from 'lucide-react';
import { DonutChart, LineChart } from '@/components/charts/Charts';
import {
  AccentCard, ChartBox, ChartCard, Empty, GridTable, Group, KpiCard, TabError,
  TabSkeleton, Td, Th, Tr, nf, nf2,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { ExportLogistics } from '@/db/queries/exportDashboardTabs';

// Logistics — where export consignments are along the loading → Kanyaka →
// border → out-of-the-DRC journey.
//
// A file is counted at the FIRST leg it has not recorded, so the stage figures
// are disjoint and add up to the consignments still moving.

const STAGE_STYLE: Array<{ color: string; icon: React.ReactNode }> = [
  { color: 'orange', icon: <Clock /> },
  { color: 'amber', icon: <Send /> },
  { color: 'lime', icon: <Flag /> },
  { color: 'emerald', icon: <MapPin /> },
  { color: 'sky', icon: <Route /> },
  { color: 'violet', icon: <Truck /> },
];

export default function LogisticsTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ExportLogistics>(
    active ? tabEndpoint('logistics') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const waiting = data.stages.reduce((sum, s) => sum + s.count, 0);
  const days = (v: number | null): string => (v === null ? '—' : v.toFixed(1));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Truck className="h-4 w-4" /> Logistics Analytics
        </h2>
        <a href={exportHref({ scope: 'logistics' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <Group
        title="Road Shipment Tracking Journey"
        hint="Each file is counted at the first leg it has not recorded, so a file appears exactly once"
        icon={<Route className="h-4 w-4" />}
        accentColor="blue"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <AccentCard
            large
            color="blue"
            icon={<Truck />}
            value={nf.format(waiting + data.completed)}
            label="Total Shipments"
            desc="still moving plus completed"
          />
          {data.stages.map((s, i) => {
            const style = STAGE_STYLE[i % STAGE_STYLE.length];
            return (
              <AccentCard
                key={s.key}
                large
                color={style.color}
                icon={style.icon}
                badge={`Stage ${i + 1}`}
                value={nf.format(s.count)}
                label={`Waiting ${s.label}`}
                desc={s.count === 0 ? 'nothing waiting here' : 'not yet recorded'}
              />
            );
          })}
          <AccentCard
            large
            color="green"
            icon={<CircleCheck />}
            value={nf.format(data.completed)}
            label="Completed"
            desc="left the DRC"
          />
        </div>
      </Group>

      <Group title="Average Transit Times" icon={<Clock className="h-4 w-4" />} accentColor="emerald">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.transit.map((t, i) => (
            <KpiCard
              key={t.key}
              value={days(t.days)}
              label={`${t.label} (Days)`}
              color={['emerald', 'sky', 'violet', 'blue'][i % 4]}
              icon={<Clock />}
            />
          ))}
        </div>
      </Group>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Monthly Logistics Trend" icon={<ChartArea className="h-4 w-4" />}>
          {data.overview.border_arrivals + data.overview.drc_exits === 0 ? (
            <Empty>No border arrivals or DRC exits recorded yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <LineChart
                  labels={data.monthly.map((m) => m.month_short)}
                  series={[
                    { label: 'Border Arrivals', values: data.monthly.map((m) => m.border_arrivals) },
                    { label: 'DRC Exits', values: data.monthly.map((m) => m.drc_exits) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Tracking Stages" icon={<ChartPie className="h-4 w-4" />}>
          {waiting + data.completed === 0 ? (
            <Empty>Nothing is in the journey yet.</Empty>
          ) : (
            <div className="flex justify-center">
              <DonutChart
                slices={[
                  ...data.stages.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: s.count })),
                  ...(data.completed > 0 ? [{ label: 'Completed', value: data.completed }] : []),
                ]}
                size={220}
                thickness={44}
                format={(v) => nf.format(v)}
              />
            </div>
          )}
        </ChartCard>
      </div>

      <Group title="Vehicle & Container Stats" icon={<Container className="h-4 w-4" />} accentColor="slate">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.vehicles.map((v, i) => (
            <KpiCard
              key={v.label}
              value={nf.format(v.shipments)}
              label={v.label}
              sub={`${nf.format(v.unique)} unique · ${nf2.format(v.weight)} weight`}
              color={i === 0 ? 'slate' : 'teal'}
              icon={i === 0 ? <Truck /> : <Train />}
            />
          ))}
          <KpiCard
            value={nf.format(data.overview.container_shipments)}
            label="Containerised"
            sub={`${nf.format(data.overview.total_seals)} seals used in all`}
            color="teal"
            icon={<Box />}
          />
        </div>
        {data.container_types.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.container_types.map((c) => (
              <KpiCard
                key={c.label}
                value={nf.format(c.count)}
                label={`${c.label} Container`}
                color="cyan"
                icon={<Container />}
              />
            ))}
          </div>
        )}
      </Group>

      <Group title="Agency Processing Times" icon={<Landmark className="h-4 w-4" />} accentColor="purple">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.processing.map((p, i) => (
            <KpiCard
              key={p.key}
              value={days(p.days)}
              label={`${p.label} — Avg Days`}
              sub={`${nf.format(p.processed)} processed`}
              color={['blue', 'green', 'orange', 'purple'][i % 4]}
              icon={<Landmark />}
            />
          ))}
        </div>
      </Group>

      <ChartCard title="Journey Milestones Reached" icon={<Flag className="h-4 w-4" />}>
        <GridTable head={<tr><Th align="left">Milestone</Th><Th>Files</Th><Th align="left">What it means</Th></tr>}>
          {(
            [
              ['Loaded', data.overview.loaded, 'Loading date recorded'],
              ['Kanyaka Arrivals', data.overview.kanyaka_arrivals, 'Reached the Kanyaka depot'],
              ['Border Arrivals', data.overview.border_arrivals, 'Reached the border post'],
              ['DRC Exits', data.overview.drc_exits, 'Left the country'],
              ['Road Shipments', data.overview.road_shipments, 'Moving by horse and trailer'],
              ['Rail Shipments', data.overview.rail_shipments, 'Moving by wagon'],
            ] as const
          ).map(([label, value, hint]) => (
            <Tr key={label}>
              <Td align="left"><strong>{label}</strong></Td>
              <Td><strong>{nf.format(value)}</strong></Td>
              <Td align="left" className="text-muted-foreground">{hint}</Td>
            </Tr>
          ))}
        </GridTable>
      </ChartCard>
    </div>
  );
}
