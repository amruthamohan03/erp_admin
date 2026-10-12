'use client';

import { useState } from 'react';
import {
  CalendarDays, CalendarRange, CalendarX, ChartBar, ChartPie, FileSpreadsheet, FolderOpen, Info,
} from 'lucide-react';
import { DonutChart, StackedColumnChart } from '@/components/charts/Charts';
import {
  AccentCard, ChartBox, ChartCard, ChartTypeSelector, Empty, GridTable, TabError,
  TabSkeleton, Td, Th, Tr, accent, nf,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { ExportTriPhase } from '@/db/queries/exportDashboardTabs';

// Tri Phase — the month split into thirds by the day a file was opened.
//
// The operation plans and bills in these three bands, so the question is
// whether the work is spread across the month or piling into the last ten days.

const PHASES = [
  { key: 'phase1', label: '01 To 10 Days', color: 'emerald', icon: <CalendarDays /> },
  { key: 'phase2', label: '11 To 20 Days', color: 'amber', icon: <CalendarRange /> },
  { key: 'phase3', label: '21 To EOM', color: 'red', icon: <CalendarX /> },
] as const;

const CHART_TYPES = [
  { value: 'stacked', label: 'Monthly' },
  { value: 'donut', label: 'This Month' },
] as const;

type ChartType = (typeof CHART_TYPES)[number]['value'];

export default function TriPhaseTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ExportTriPhase>(
    active ? tabEndpoint('triphase') : null,
  );
  const [chartType, setChartType] = useState<ChartType>('stacked');

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const counts: Record<string, number> = {
    phase1: data.phase1,
    phase2: data.phase2,
    phase3: data.phase3,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <CalendarRange className="h-4 w-4" /> Tri-Phase Analysis
        </h2>
        <a href={exportHref({ scope: 'triphase' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="rounded-lg border border-border border-l-4 border-l-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <strong className="inline-flex items-center gap-1.5">
          <Info className="h-4 w-4" /> Current Month: {data.month_label}
        </strong>
        <span className="ms-2">Exports opened on days 1–10, 11–20 and 21 to the end of the month.</span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        <AccentCard
          large
          color="sky"
          icon={<FolderOpen />}
          value={nf.format(data.total)}
          label="Grand Total"
          desc={data.month_label}
        />
      </div>

      <ChartCard
        title={chartType === 'stacked' ? 'Monthly Phase Breakdown' : `Current Month — ${data.month_label}`}
        icon={chartType === 'stacked' ? <ChartBar className="h-4 w-4" /> : <ChartPie className="h-4 w-4" />}
      >
        <ChartTypeSelector value={chartType} onChange={setChartType} options={CHART_TYPES} />
        {chartType === 'stacked' ? (
          data.monthly.every((m) => m.phase1 + m.phase2 + m.phase3 === 0) ? (
            <Empty>No files opened in the last twelve months.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <StackedColumnChart
                  labels={data.monthly.map((m) => m.month_short)}
                  series={PHASES.map((p) => ({
                    label: p.label,
                    values: data.monthly.map((m) => m[p.key]),
                  }))}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )
        ) : data.total === 0 ? (
          <Empty>No files opened yet this month, so there is nothing to divide.</Empty>
        ) : (
          <div className="flex justify-center">
            <DonutChart
              slices={PHASES.map((p) => ({ label: p.label, value: counts[p.key] }))}
              size={230}
              thickness={46}
              format={(v) => nf.format(v)}
            />
          </div>
        )}
      </ChartCard>

      <ChartCard title="Client Performance by Phase" icon={<ChartBar className="h-4 w-4" />}>
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
                {/* §4.15 — the client is a column on someone else's row. */}
                <Td align="left"><strong>{r.client_name ?? '—'}</strong></Td>
                <Td><strong>{nf.format(r.total)}</strong></Td>
                {PHASES.map((p) => (
                  <Td key={p.key}>{nf.format(r[p.key])}</Td>
                ))}
                <Td>
                  {/* A stacked bar, because the question is the SHAPE of the
                      month — three numbers again would not show it. */}
                  <span
                    className="mx-auto flex h-2.5 w-28 overflow-hidden rounded-full bg-muted"
                    title={`${r.phase1} / ${r.phase2} / ${r.phase3}`}
                  >
                    {PHASES.map((p) => (
                      <span
                        key={p.key}
                        style={{
                          width: `${(r[p.key] / Math.max(1, r.total)) * 100}%`,
                          background: accent(p.color),
                        }}
                      />
                    ))}
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
