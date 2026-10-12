'use client';

import { useState } from 'react';
import { CalendarRange, Files, Hourglass, Timer, TimerReset } from 'lucide-react';
import { BarChart, DonutChart } from '@/components/charts/Charts';
import {
  AccentCard,
  ChartBox,
  ChartCard,
  ChartTypeSelector,
  Empty,
  GridTable,
  SectionHeader,
  TabError,
  TabSkeleton,
  Td,
  Th,
  Tr,
  accent,
  nf,
} from '../dashboardUi';
import { tabEndpoint, useTabData } from './useTabData';
import type { ImportTriPhase } from '@/db/queries/importDashboardTabs';

// Tri Phase — the month split into thirds by the day a file was opened.
//
// The operation plans and bills in these three bands, so the question is
// whether the work is spread across the month or piling into the last ten days.
// The chart offers the design's three shapes; the by-client table covers three
// months, because one month's split is too small to read a pattern from.

const PHASES = [
  { key: 'phase1', label: 'Days 1 - 10', color: 'emerald', icon: <Timer /> },
  { key: 'phase2', label: 'Days 11 - 20', color: 'amber', icon: <Hourglass /> },
  { key: 'phase3', label: 'Days 21 - End', color: 'red', icon: <TimerReset /> },
] as const;

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
] as const;

type ChartType = (typeof CHART_TYPES)[number]['value'];

export default function TriPhaseTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ImportTriPhase>(
    active ? tabEndpoint('triphase') : null,
  );
  const [chartType, setChartType] = useState<ChartType>('bar');

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const counts: Record<string, number> = {
    phase1: data.phase1,
    phase2: data.phase2,
    phase3: data.phase3,
  };
  const slices = PHASES.map((p) => ({ label: p.label, value: counts[p.key] }));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tri-Phase Monthly Division"
        hint="Days 1-10, 11-20, 21-End"
        icon={<CalendarRange className="h-4 w-4" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AccentCard
          large
          color="sky"
          icon={<Files />}
          value={nf.format(data.total)}
          label={`Total — ${data.month_label}`}
          desc="files opened this month"
        />
        {PHASES.map((p) => (
          <AccentCard
            key={p.key}
            large
            color={p.color}
            icon={p.icon}
            value={nf.format(counts[p.key])}
            label={p.label}
            desc={
              data.total > 0
                ? `${Math.round((counts[p.key] / data.total) * 100)}% of the month`
                : 'nothing opened yet'
            }
          />
        ))}
      </div>

      <ChartCard title="Tri-Phase Chart">
        <ChartTypeSelector value={chartType} onChange={setChartType} options={CHART_TYPES} />
        {data.total === 0 ? (
          <Empty>No files opened yet this month, so there is nothing to divide.</Empty>
        ) : chartType === 'bar' ? (
          <ChartBox span="full">
            {(w) => (
              <BarChart
                labels={PHASES.map((p) => p.label)}
                series={[{ label: 'Files', values: PHASES.map((p) => counts[p.key]) }]}
                width={w}
                height={170}
                format={(v) => nf.format(v)}
              />
            )}
          </ChartBox>
        ) : (
          <div className="flex justify-center">
            <DonutChart
              slices={slices}
              size={220}
              // A pie is a donut with no hole, so one component serves both of
              // the design's shapes rather than a second chart that would then
              // need its own legend and tooltips.
              thickness={chartType === 'pie' ? 120 : 40}
              format={(v) => nf.format(v)}
            />
          </div>
        )}
      </ChartCard>

      <ChartCard title="Client Performance by Phase">
        {data.by_client.length === 0 ? (
          <Empty>No files opened in the last three months.</Empty>
        ) : (
          <GridTable
            head={
              <tr>
                <Th align="left">Client</Th>
                <Th>Total</Th>
                {PHASES.map((p) => (
                  <Th key={p.key}>{p.label}</Th>
                ))}
                <Th>Spread</Th>
              </tr>
            }
          >
            {data.by_client.map((r) => (
              <Tr key={r.client_name ?? 'unknown'}>
                {/* §4.15 — the client is a column on someone else's row, so the code. */}
                <Td align="left"><strong>{r.client_name ?? '—'}</strong></Td>
                <Td><strong>{nf.format(r.total)}</strong></Td>
                <Td>{nf.format(r.phase1)}</Td>
                <Td>{nf.format(r.phase2)}</Td>
                <Td>{nf.format(r.phase3)}</Td>
                <Td>
                  {/* A stacked bar, because the question is the SHAPE of the
                      month — three numbers again would not show it. */}
                  <span
                    className="mx-auto flex h-2.5 w-28 overflow-hidden rounded-full bg-muted"
                    title={`${r.phase1} / ${r.phase2} / ${r.phase3}`}
                  >
                    {PHASES.map((p) => {
                      const v = p.key === 'phase1' ? r.phase1 : p.key === 'phase2' ? r.phase2 : r.phase3;
                      return (
                        <span
                          key={p.key}
                          style={{
                            width: `${(v / Math.max(1, r.total)) * 100}%`,
                            background: accent(p.color),
                          }}
                        />
                      );
                    })}
                  </span>
                </Td>
              </Tr>
            ))}
          </GridTable>
        )}
      </ChartCard>
    </div>
  );
}
