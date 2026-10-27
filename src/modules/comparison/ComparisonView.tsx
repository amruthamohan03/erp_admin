'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Building2, CalendarRange, ChartLine, GitCompare, Users, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { BarChart, LineChart } from '@/components/charts/Charts';
import { ChartBox, ChartCard, Empty, GridTable, Group, TabError, TabSkeleton, Td, Th, Tr } from '@/modules/tracking/dashboardUi';
import { useFetchedData } from '@/lib/hooks/useFetchedData';
import { fetchClientOptions } from '@/lib/clientOptions';
import { changeOf, formatChange, formatMetric, type ComparisonResult } from '@/lib/comparison';
import { MAX_COMPARED, type ComparisonMode } from '@/schemas/comparison';

// §4.29 — the comparison screen the Client, Licence and Tracking comparison
// dashboards share. A module page passes its endpoint and title; everything
// else — the four modes, the pickers, the side-by-side table, the charts — is
// this one component, so the three dashboards cannot drift apart (§4.10).
//
// Every figure comes from the server's SQL aggregates (§4.29); nothing here
// counts rows.

const MODES: Array<{ key: ComparisonMode; label: string; icon: React.ReactNode }> = [
  { key: 'period', label: 'Period vs Period', icon: <CalendarRange className="h-4 w-4" /> },
  { key: 'client', label: 'Client vs Client', icon: <Users className="h-4 w-4" /> },
  { key: 'direction', label: 'Import vs Export', icon: <ArrowLeftRight className="h-4 w-4" /> },
  { key: 'office', label: 'Office vs Office', icon: <Building2 className="h-4 w-4" /> },
];

const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  bad: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-muted-foreground',
};

/** `2026-10` → `10-2026` — month-first is never shown (§4.19). */
const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-');
  return m && y ? `${m}-${y}` : ym;
};

export default function ComparisonView({
  endpoint,
  title,
  subtitle,
}: {
  /** e.g. `/api/v1/licenses/comparison` */
  endpoint: string;
  title: string;
  subtitle: string;
}) {
  const [mode, setMode] = useState<ComparisonMode>('period');
  const [range, setRange] = useState({ from: '', to: '' });
  const [periods, setPeriods] = useState({ a_from: '', a_to: '', b_from: '', b_to: '' });
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [officeIds, setOfficeIds] = useState<number[]>([]);
  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    void fetchClientOptions().then(setClients);
  }, []);

  const url = useMemo(() => {
    const p = new URLSearchParams({ mode });
    const set = (k: string, v: string): void => {
      if (v) p.set(k, v);
    };
    if (mode === 'period') {
      for (const [k, v] of Object.entries(periods)) set(k, v);
    } else {
      set('from', range.from);
      set('to', range.to);
    }
    if (mode === 'client' && clientIds.length) p.set('client_ids', clientIds.join(','));
    if (mode === 'office' && officeIds.length) p.set('office_ids', officeIds.join(','));
    return `${endpoint}?${p.toString()}`;
  }, [endpoint, mode, range, periods, clientIds, officeIds]);

  const { data, loading, error } = useFetchedData<ComparisonResult>(url);

  // The server auto-picks the busiest clients / offices when none are chosen;
  // adopt that pick so the chips show what is actually being compared.
  useEffect(() => {
    if (!data?.autoPicked) return;
    const ids = data.slices.map((s) => Number(s.key.split('-')[1])).filter((n) => Number.isInteger(n));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data.mode === 'client' && clientIds.length === 0) setClientIds(ids);
    if (data.mode === 'office' && officeIds.length === 0) setOfficeIds(ids);
  }, [data, clientIds.length, officeIds.length]);

  const officeOptions = (data?.available.offices ?? []).map((o) => ({ value: String(o.id), label: o.label }));
  const officeLabel = data?.available.officeLabel ?? 'Office';
  const modes = MODES.filter((m) => m.key !== 'direction' || (data?.available.directions.length ?? 1) > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <GitCompare className="h-7 w-7" />
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Mode */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-2.5">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${
              mode === m.key
                ? 'bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white'
                : 'text-foreground hover:bg-muted'
            }`}
            aria-pressed={mode === m.key}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Pickers */}
      <div className="card space-y-3 p-4">
        {mode === 'period' ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(['a', 'b'] as const).map((k) => (
              <div key={k}>
                <p className="label">{k === 'a' ? 'Period A' : 'Period B'}</p>
                <div className="flex items-center gap-2">
                  <input type="date" aria-label={`Period ${k.toUpperCase()} start`} className="input min-w-0 flex-1"
                    value={periods[`${k}_from`]} onChange={(e) => setPeriods((p) => ({ ...p, [`${k}_from`]: e.target.value }))} />
                  <span className="text-muted-foreground">to</span>
                  <input type="date" aria-label={`Period ${k.toUpperCase()} end`} className="input min-w-0 flex-1"
                    value={periods[`${k}_to`]} onChange={(e) => setPeriods((p) => ({ ...p, [`${k}_to`]: e.target.value }))} />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground md:col-span-2">
              Leave the dates empty to compare this year so far with the same stretch of last year.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="label">Date range</p>
              <div className="flex items-center gap-2">
                <input type="date" aria-label="From" className="input w-auto" value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                <span className="text-muted-foreground">to</span>
                <input type="date" aria-label="To" className="input w-auto" value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              </div>
            </div>
            <p className="pb-2 text-xs text-muted-foreground">Empty = the last 12 months.</p>
          </div>
        )}

        {(mode === 'client' || mode === 'office') && (
          <Picker
            label={mode === 'client' ? 'Clients' : `${officeLabel}s`}
            options={mode === 'client' ? clients : officeOptions}
            ids={mode === 'client' ? clientIds : officeIds}
            onChange={mode === 'client' ? setClientIds : setOfficeIds}
          />
        )}
        {data?.autoPicked && <p className="text-xs text-muted-foreground">{data.autoPicked}</p>}
      </div>

      {error ? (
        <TabError message={error} />
      ) : !data ? (
        loading ? <TabSkeleton tiles={0} panels={2} /> : null
      ) : data.slices.length === 0 ? (
        <Empty>
          {mode === 'client'
            ? 'No client has any activity in this range — widen the dates or choose clients.'
            : mode === 'office'
              ? `No ${officeLabel.toLowerCase()} has any activity in this range — widen the dates or choose one.`
              : 'Nothing to compare in this range.'}
        </Empty>
      ) : (
        <Comparison data={data} />
      )}
    </div>
  );
}

/** Add up to MAX_COMPARED ids from a searchable list; chips remove them. */
function Picker({
  label,
  options,
  ids,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  ids: number[];
  onChange: (ids: number[]) => void;
}) {
  const name = new Map(options.map((o) => [o.value, o.label]));
  const full = ids.length >= MAX_COMPARED;
  return (
    <div>
      <p className="label">{label} (up to {MAX_COMPARED})</p>
      <div className="flex flex-wrap items-center gap-2">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm text-foreground">
            {name.get(String(id)) ?? `#${id}`}
            <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`Remove ${name.get(String(id)) ?? id}`} className="ico">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <div className="w-56">
          <SearchableSelect
            value=""
            onChange={(v) => v && !full && onChange([...ids, Number(v)])}
            options={options.filter((o) => !ids.includes(Number(o.value)))}
            placeholder={full ? `${MAX_COMPARED} chosen — remove one to add` : `Add ${label.toLowerCase().replace(/s$/u, '')}…`}
            aria-label={`Add ${label}`}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

function Comparison({ data }: { data: ComparisonResult }) {
  const base = data.slices[0];
  const headline = data.metrics.find((m) => m.key === data.headline) ?? data.metrics[0];

  // Slices are aligned by position for the trend: two periods of different
  // calendar months still line up month 1, month 2… The first slice names them.
  const length = Math.max(...data.slices.map((s) => s.monthly.length), 0);
  const trendLabels = Array.from({ length }, (_, i) =>
    base.monthly[i] ? monthLabel(base.monthly[i].month) : `M${i + 1}`,
  );

  return (
    <div className="space-y-6">
      <Group title="Side by side" hint={`Change is measured against ${base.label}`} icon={<GitCompare className="h-4 w-4" />} accentColor="purple">
        <GridTable
          head={
            <tr>
              <Th align="left">Metric</Th>
              {data.slices.map((s, i) => (
                <Th key={s.key} align="right">
                  <span className="block">{s.label}</span>
                  {s.detail && <span className="block text-xs font-normal text-muted-foreground">{s.detail}</span>}
                  {i > 0 && <span className="block text-xs font-normal text-muted-foreground">vs {base.label}</span>}
                </Th>
              ))}
            </tr>
          }
        >
          {data.metrics.map((m) => (
            <Tr key={m.key}>
              <Td align="left" title={m.hint}>
                <span className="font-semibold">{m.label}</span>
                {m.hint && <span className="block text-xs text-muted-foreground">{m.hint}</span>}
              </Td>
              {data.slices.map((s, i) => {
                const change = i > 0 ? changeOf(s.values[m.key] ?? null, base.values[m.key] ?? null, m.better) : null;
                return (
                  <Td key={s.key} align="right">
                    <span className="block font-semibold tabular-nums">{formatMetric(s.values[m.key] ?? null, m.format)}</span>
                    {i > 0 && (
                      <span className={`block text-xs ${TONE[change?.tone ?? 'neutral']}`}>{formatChange(change, m.format)}</span>
                    )}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </GridTable>
      </Group>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title={headline.label} icon={<GitCompare className="h-4 w-4" />}>
          <ChartBox span="half">
            {(w) => (
              <BarChart
                labels={data.slices.map((s) => s.label)}
                series={[{ label: headline.label, values: data.slices.map((s) => s.values[headline.key] ?? 0) }]}
                width={w}
                height={220}
                format={(v) => formatMetric(v, headline.format)}
              />
            )}
          </ChartBox>
        </ChartCard>
        <ChartCard title={`${headline.label} — month by month`} icon={<ChartLine className="h-4 w-4" />}>
          {length === 0 ? (
            <Empty>No monthly figures in this range.</Empty>
          ) : (
            <ChartBox span="half">
              {(w) => (
                <LineChart
                  labels={trendLabels}
                  series={data.slices.map((s) => ({ label: s.label, values: trendLabels.map((_, i) => s.monthly[i]?.value ?? 0) }))}
                  width={w}
                  height={220}
                  format={(v) => formatMetric(v, headline.format)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
