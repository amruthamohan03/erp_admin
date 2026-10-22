'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck, ChartBar, Clock, FileSpreadsheet, Filter, Hourglass, ShieldCheck, UserCheck, Workflow, X,
} from 'lucide-react';
import { BarChart, HBarChart } from '@/components/charts/Charts';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { AgeBand, FicheWorkflowTab } from '@/db/queries/ficheDashboardTabs';
import FicheTable from './FicheTable';
import { stateColor, terminalOf } from './OverviewTab';
import { exportHref, tabEndpoint, useTabData } from './useTabData';

// Workflow — where the fiches sit in the configured workflow (§4.6), how long
// the ones still in progress have waited since they were raised, and who has
// been verifying and auditing them. The ageing cards narrow the in-progress
// list to the fiches they counted (§4.29).

const AGE_COLOR: Record<AgeBand, string> = {
  D0_7: 'emerald',
  D8_30: 'sky',
  D31_60: 'amber',
  D60_PLUS: 'rose',
};

const days = (v: number | null): string => (v === null ? '—' : `${nf2.format(v)} days`);

export default function WorkflowTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<FicheWorkflowTab>(active ? tabEndpoint('workflow') : null);
  const [band, setBand] = useState<{ band: AgeBand; label: string } | null>(null);

  const rows = useMemo(() => {
    const all = data?.waiting ?? [];
    return band ? all.filter((r) => r.age_band === band.band) : all;
  }, [data, band]);
  const terminal = useMemo(() => terminalOf(data?.states ?? []), [data]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={2} /> : null;

  const waitingCount = data.waiting.length;
  const oldest = data.waiting.reduce((m, r) => Math.max(m, r.age_days), 0);
  const raised = data.monthly.reduce((s, m) => s + m.count + m.verified + m.audited, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Workflow className="h-4 w-4" /> Workflow
        </h2>
        <a href={exportHref('waiting')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export In Progress
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.states.map((s, i) => (
          <KpiCard
            key={s.state || '(none)'}
            value={nf.format(s.count)}
            label={s.label}
            color={stateColor(s, i)}
            icon={<Workflow />}
            sub={s.terminal ? 'Finished — locked' : 'In progress'}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(waitingCount)} label="Fiches In Progress" color="warning" icon={<Hourglass />} />
        <KpiCard
          value={days(data.avg_days_to_verify)}
          label="Average Time to Verify"
          color="violet"
          icon={<BadgeCheck />}
          sub={`From creation · ${nf.format(data.verified)} verified`}
        />
        <KpiCard
          value={days(data.avg_days_to_audit)}
          label="Average Time to Audit"
          color="dark"
          icon={<ShieldCheck />}
          sub={`From creation · ${nf.format(data.audited)} audited`}
        />
        <KpiCard
          value={waitingCount > 0 ? `${nf.format(oldest)} days` : '—'}
          label="Oldest In Progress"
          color="slate"
          icon={<Clock />}
        />
      </div>

      {/* Ageing cards filter the in-progress list below. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.ageing.map((a) => (
          <KpiCard
            key={a.band}
            value={nf.format(a.count)}
            label={`Waiting ${a.label}`}
            color={AGE_COLOR[a.band]}
            icon={<Hourglass />}
            sub="Since the fiche was raised"
            onClick={() => setBand((b) => (b?.band === a.band ? null : { band: a.band, label: a.label }))}
            active={band?.band === a.band}
          />
        ))}
      </div>

      <ChartCard title="Raised, Verified and Audited (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
        {raised === 0 ? (
          <Empty>No fiche was raised, verified or audited in the last twelve months.</Empty>
        ) : (
          <ChartBox span="full">
            {(w) => (
              <BarChart
                labels={data.monthly.map((m) => m.month_short)}
                series={[
                  { label: 'Raised', values: data.monthly.map((m) => m.count) },
                  { label: 'Verified', values: data.monthly.map((m) => m.verified) },
                  { label: 'Audited', values: data.monthly.map((m) => m.audited) },
                ]}
                width={w}
                height={200}
                format={(v) => nf.format(v)}
              />
            )}
          </ChartBox>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Verified By" icon={<UserCheck className="h-4 w-4" />}>
          <HBarChart
            items={data.verifiers.map((p) => ({ label: p.label, value: p.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No fiche has been verified yet."
          />
        </ChartCard>
        <ChartCard title="Audited By" icon={<ShieldCheck className="h-4 w-4" />}>
          <HBarChart
            items={data.auditors.map((p) => ({ label: p.label, value: p.count }))}
            format={(v) => nf.format(v)}
            emptyLabel="No fiche has been audited yet."
          />
        </ChartCard>
      </div>

      <Group
        title="Fiches In Progress"
        hint={`${nf.format(rows.length)} of ${nf.format(waitingCount)} shown`}
        icon={<Hourglass className="h-4 w-4" />}
        accentColor="amber"
      >
        {band && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: waiting {band.label} — {nf.format(rows.length)} fiche{rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setBand(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}
        <FicheTable
          rows={rows}
          loading={loading}
          terminal={terminal}
          scope="waiting"
          showAge
          emptyMessage={
            band
              ? `No fiche has been waiting ${band.label} — clear the filter to see the rest.`
              : 'Every fiche has reached the end of its workflow — nothing is in progress.'
          }
        />
      </Group>
    </div>
  );
}
