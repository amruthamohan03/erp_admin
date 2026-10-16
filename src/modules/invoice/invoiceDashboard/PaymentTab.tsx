'use client';

import { ChartBar, ChartPie, Coins, CreditCard, FileSpreadsheet, Wallet } from 'lucide-react';
import { DonutChart, HBarChart, StackedColumnChart } from '@/components/charts/Charts';
import {
  ChartBox, ChartCard, Empty, KpiCard, TabError, TabSkeleton, nf,
} from '@/modules/tracking/dashboardUi';
import type { InvoicePayment } from '@/db/queries/invoiceDashboardTabs';
import type { InvoiceKind } from '@/schemas/invoice-dashboard';
import { usd } from './OverviewTab';
import { exportHref, tabEndpoint, useTabData } from './useTabData';

// Payment mode — how invoices are settled (credit, cash, …), by count and
// value, and how that mix moves month to month. The modes are whatever the
// invoices carry, not a list fixed here.

const CARD_COLORS = ['blue', 'green', 'purple', 'orange', 'teal', 'rose'];

export default function PaymentTab({ kind, active }: { kind: InvoiceKind; active: boolean }) {
  const { data, error, loading } = useTabData<InvoicePayment>(active ? tabEndpoint(kind, 'payment') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const totalCount = data.modes.reduce((s, m) => s + m.count, 0);
  const totalValue = data.modes.reduce((s, m) => s + m.value_usd, 0);
  const pct = (n: number, of: number): string => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Wallet className="h-4 w-4" /> Payment Mode
        </h2>
        <a href={exportHref(kind, 'payment')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      {data.modes.length === 0 ? (
        <Empty>No invoices yet.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {data.modes.slice(0, 4).map((m, i) => (
              <KpiCard
                key={m.label}
                value={usd(m.value_usd)}
                label={m.label}
                color={CARD_COLORS[i % CARD_COLORS.length]}
                icon={i === 0 ? <CreditCard /> : <Coins />}
                sub={`${nf.format(m.count)} invoices · ${pct(m.value_usd, totalValue)} of value`}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Share of Invoices" icon={<ChartPie className="h-4 w-4" />}>
              <div className="flex justify-center">
                <DonutChart
                  slices={data.modes.map((m) => ({ label: m.label, value: m.count }))}
                  size={220}
                  thickness={44}
                  format={(v) => `${nf.format(v)} (${pct(v, totalCount)})`}
                />
              </div>
            </ChartCard>
            <ChartCard title="Billed Value by Payment Mode" icon={<Coins className="h-4 w-4" />}>
              <HBarChart
                items={data.modes.map((m) => ({
                  label: m.label,
                  value: m.value_usd,
                  note: `${nf.format(m.count)} invoice${m.count === 1 ? '' : 's'}`,
                }))}
                format={usd}
              />
            </ChartCard>
          </div>

          <ChartCard title="Monthly Mix — billed value (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
            <ChartBox span="full">
              {(w) => (
                <StackedColumnChart
                  labels={data.monthly.map((m) => m.month_short)}
                  series={data.modes.map((mode, i) => ({
                    label: mode.label,
                    values: data.monthly.map((m) => m.values[i] ?? 0),
                  }))}
                  width={w}
                  height={200}
                  format={usd}
                />
              )}
            </ChartBox>
          </ChartCard>
        </>
      )}
    </div>
  );
}
