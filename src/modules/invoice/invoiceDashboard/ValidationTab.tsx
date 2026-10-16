'use client';

import { useMemo, useState } from 'react';
import { ChartBar, Clock, FileSpreadsheet, Filter, Hourglass, Landmark, ShieldCheck, X } from 'lucide-react';
import { BarChart, HBarChart } from '@/components/charts/Charts';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { AgeBand, InvoiceValidation } from '@/db/queries/invoiceDashboardTabs';
import type { InvoiceKind } from '@/schemas/invoice-dashboard';
import InvoiceTable from './InvoiceTable';
import { STATUS_CARDS, usd } from './OverviewTab';
import { exportHref, tabEndpoint, useTabData } from './useTabData';

// Validation & DGI — how far each invoice has got through Not Validated →
// Validated → DGI Verified, and how long the ones still in the pipeline have
// been waiting. The ageing cards narrow the pending list to the invoices they
// counted (§4.29).

const AGE_COLOR: Record<AgeBand, string> = {
  D0_7: 'emerald',
  D8_30: 'sky',
  D31_60: 'amber',
  D60_PLUS: 'rose',
};

export default function ValidationTab({ kind, active }: { kind: InvoiceKind; active: boolean }) {
  const { data, loading, error } = useTabData<InvoiceValidation>(active ? tabEndpoint(kind, 'validation') : null);
  const [band, setBand] = useState<{ band: AgeBand; label: string } | null>(null);

  const rows = useMemo(() => {
    const all = data?.pending ?? [];
    return band ? all.filter((r) => r.age_band === band.band) : all;
  }, [data, band]);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={2} /> : null;

  const { kpi } = data;
  const pendingCount = data.pending.length;
  const pendingValue = data.pending.reduce((s, r) => s + r.total, 0);
  const oldest = data.pending.reduce((m, r) => Math.max(m, r.age_days), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <ShieldCheck className="h-4 w-4" /> Validation &amp; DGI
        </h2>
        <a href={exportHref(kind, 'pending')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export Pending
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATUS_CARDS.map((c) => (
          <KpiCard key={c.value} value={nf.format(c.count(kpi))} label={c.value} color={c.color} icon={c.icon} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(pendingCount)} label="Awaiting DGI Verification" color="warning" icon={<Hourglass />} />
        <KpiCard value={usd(pendingValue)} label="Value Awaiting (USD)" color="rose" icon={<Clock />} />
        <KpiCard value={nf2.format(kpi.dgi_usd)} label="DGI Amount Recorded" color="dark" icon={<Landmark />} />
        <KpiCard
          value={pendingCount > 0 ? `${nf.format(oldest)} days` : '—'}
          label="Oldest Waiting"
          color="slate"
          icon={<Clock />}
        />
      </div>

      {/* Ageing cards filter the pending list below. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.ageing.map((a) => (
          <KpiCard
            key={a.band}
            value={nf.format(a.count)}
            label={`Waiting ${a.label}`}
            color={AGE_COLOR[a.band]}
            icon={<Hourglass />}
            sub={usd(a.value_usd)}
            onClick={() => setBand((b) => (b?.band === a.band ? null : { band: a.band, label: a.label }))}
            active={band?.band === a.band}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Created vs DGI Verified (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
          {kpi.total === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <BarChart
                  labels={data.monthly.map((m) => m.month_short)}
                  series={[
                    { label: 'Created', values: data.monthly.map((m) => m.created) },
                    { label: 'DGI Verified', values: data.monthly.map((m) => m.verified) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Status — by billed value" icon={<ShieldCheck className="h-4 w-4" />}>
          <HBarChart
            items={data.status.map((s) => ({
              label: s.label,
              value: s.value_usd,
              note: `${nf.format(s.count)} invoice${s.count === 1 ? '' : 's'}`,
            }))}
            format={usd}
            emptyLabel="No invoices yet."
          />
        </ChartCard>
      </div>

      <Group
        title="Not Yet DGI Verified"
        hint={`${nf.format(rows.length)} of ${nf.format(pendingCount)} shown`}
        icon={<Hourglass className="h-4 w-4" />}
        accentColor="amber"
      >
        {band && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
            <span className="inline-flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              Filtered: waiting {band.label} — {nf.format(rows.length)} invoice{rows.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={() => setBand(null)} className="btn-secondary btn-sm">
              <X className="h-4 w-4" /> Clear Filter
            </button>
          </div>
        )}
        <InvoiceTable
          kind={kind}
          rows={rows}
          loading={loading}
          scope="pending"
          showAge
          emptyMessage={
            band
              ? `No invoices have been waiting ${band.label} — clear the filter to see the rest.`
              : 'Every invoice is DGI verified — nothing is waiting.'
          }
        />
      </Group>
    </div>
  );
}
