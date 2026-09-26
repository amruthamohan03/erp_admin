'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, FileCheck, FileSpreadsheet, FileText, Send, Truck, Users, Wallet } from 'lucide-react';
import RecentActivity from '@/components/dashboard/RecentActivity';
import InboxPanel from '@/components/dashboard/InboxPanel';
import { AreaChart, BarChart, HBarChart, LineChart, StackedBars } from '@/components/charts/Charts';
import { gradient } from '@/components/ui/cardGradient';
import { safeFetchJson } from '@/lib/safeFetch';
import type { OverviewDashboard } from '@/db/queries/overviewDashboard';

// §4.29 — the home dashboard.
//
// What used to live here was the card grid, which is really a set of report
// shortcuts; it now has its own screen as Excel Report. This answers the
// question somebody actually has when they sign in: where is the work, is it
// moving, and is anything about to lapse.
//
// Charts are plain SVG from `components/charts` — no charting dependency, which
// would need a question first (§12) — and every series colour is a `--chart-*`
// token carrying both themes (§4.20, §4.32).


/** §4.38 — the band an operator must act on reads as urgent, not as series 4. */
const EXPIRY_HUE: Record<string, string> = {
  Expired: 'hsl(var(--chart-5))',
  'Within 7 days': 'hsl(var(--chart-4))',
  '8 – 30 days': 'hsl(var(--chart-2))',
  '31 – 60 days': 'hsl(var(--chart-1))',
  '61 – 90 days': 'hsl(var(--chart-3))',
};

const nf = new Intl.NumberFormat('en-US');
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Compact for an axis: 12 400 000 is unreadable on a tick, 12.4M is not. */
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function Tile({
  label,
  value,
  sub,
  color,
  icon,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</span>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold text-white" title={value}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-white/80">{sub}</div>}
    </>
  );
  const className = `card bg-gradient-to-br ${gradient(color)} p-4`;
  return href ? (
    <Link href={href} className={`${className} transition-transform hover:scale-[1.02]`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await safeFetchJson<OverviewDashboard>('/api/v1/dashboard/overview');
      if (cancelled) return;
      if (!res.ok) setError(res.message || 'The dashboard could not be loaded.');
      else setData(res.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const k = data?.kpi;
  const months = data?.monthly ?? [];
  const labels = months.map((m) => m.month_name);

  // The endpoint drops empty slices so a doughnut never draws an invisible arc;
  // the stacked rows want the zeroes back, because "0 validated" is exactly what
  // this panel is for saying.
  const invoiceValue = (label: string): number =>
    data?.invoice_split.find((s) => s.label === label)?.value ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Link href="/reports/excel" className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Excel Report
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!data && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-24 animate-pulse bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-60 animate-pulse bg-muted" />
            ))}
          </div>
        </>
      )}

      {k && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Open Imports"
            value={nf.format(k.imports_open)}
            sub={`${nf.format(k.imports_total)} all time`}
            color="violet"
            icon={<Boxes className="h-4 w-4" />}
            href="/imports"
          />
          <Tile
            label="Open Exports"
            value={nf.format(k.exports_open)}
            sub={`${nf.format(k.exports_total)} all time`}
            color="sky"
            icon={<Send className="h-4 w-4" />}
            href="/exports"
          />
          <Tile
            label="Licences Expiring"
            value={nf.format(k.licenses_expiring)}
            sub={`${nf.format(k.licenses_active)} active · ${nf.format(k.licenses_expired)} expired`}
            color="amber"
            icon={<FileCheck className="h-4 w-4" />}
            href="/licenses?card=expiring"
          />
          <Tile
            label="Open Local"
            value={nf.format(k.locals_open)}
            sub={`${nf.format(k.locals_total)} all time`}
            color="teal"
            icon={<Truck className="h-4 w-4" />}
            href="/local"
          />
          <Tile
            label="Outstanding Payments"
            value={nf2.format(k.payments_open_amount)}
            sub={`${nf.format(k.payments_open)} request${k.payments_open === 1 ? '' : 's'} in approval`}
            color="rose"
            icon={<Wallet className="h-4 w-4" />}
            href="/payments"
          />
          <Tile
            label="Invoices to Validate"
            value={nf.format(k.invoices_pending)}
            sub={`${nf.format(k.invoices_validated)} already validated`}
            color="fuchsia"
            icon={<FileText className="h-4 w-4" />}
            href="/export-invoices"
          />
          <Tile
            label="Clients & Users"
            value={`${nf.format(k.clients_active)} · ${nf.format(k.users_active)}`}
            sub="Active clients · active users"
            color="cyan"
            icon={<Users className="h-4 w-4" />}
            href="/masters/clients"
          />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Files opened" hint="All three tracking modules, per month, over the last twelve.">
            <LineChart
              labels={labels}
              format={(v) => nf.format(v)}
              series={[
                { label: 'Imports', values: months.map((m) => m.imports) },
                { label: 'Exports', values: months.map((m) => m.exports) },
                { label: 'Local', values: months.map((m) => m.locals) },
              ]}
            />
          </Panel>

          {/* The "where is everything" panel — clearing status across all three
              modules at once, which no per-module screen can show. */}
          <Panel title="Clearing status by module" hint="Every file, grouped by the status master.">
            <BarChart
              labels={data.status_split.map((s) => s.status ?? 'Not set')}
              format={(v) => nf.format(v)}
              series={[
                { label: 'Imports', values: data.status_split.map((s) => s.imports) },
                { label: 'Exports', values: data.status_split.map((s) => s.exports) },
                { label: 'Local', values: data.status_split.map((s) => s.locals) },
              ]}
            />
          </Panel>

          <Panel title="Declared value cleared" hint="Combined FOB per month, both sides.">
            <AreaChart
              labels={(data.monthly_value ?? []).map((m) => m.month_name)}
              format={(v) => compact.format(v)}
              series={[{ label: 'FOB', values: (data.monthly_value ?? []).map((m) => m.fob) }]}
            />
          </Panel>

          {/* Validated versus pending is the only thing worth knowing per side,
              and a stacked row answers it without matching four slices to a
              legend across a circle. */}
          <Panel title="Invoices" hint="Raised against clients — how much of each side is validated.">
            <StackedBars
              format={(v) => nf.format(v)}
              emptyLabel="No invoices raised yet."
              groups={[
                {
                  label: 'Import invoices',
                  segments: [
                    { label: 'Validated', value: invoiceValue('Import · validated') },
                    { label: 'Pending', value: invoiceValue('Import · pending') },
                  ],
                },
                {
                  label: 'Export invoices',
                  segments: [
                    { label: 'Validated', value: invoiceValue('Export · validated') },
                    { label: 'Pending', value: invoiceValue('Export · pending') },
                  ],
                },
              ]}
            />
          </Panel>

          {/* Coloured by urgency rather than by series: an expired licence is
              blocking work now, and the band an operator must act on this week
              should not be the same hue as one three months out (§4.38's
              reading — stopped, waiting, fine). */}
          <Panel title="Licences by time to expiry" hint="Each licence counted once, in the band it falls in.">
            <HBarChart
              format={(v) => nf.format(v)}
              emptyLabel="No active licences with an expiry date."
              items={data.expiry_outlook.map((o) => ({
                label: o.label,
                value: o.count,
                color: EXPIRY_HUE[o.label] ?? 'hsl(var(--chart-3))',
              }))}
            />
          </Panel>

          <Panel title="Busiest clients" hint="By open files right now, across all three modules.">
            <HBarChart
              format={(v) => nf.format(v)}
              emptyLabel="Nothing open against any client."
              items={data.top_clients.map((c) => ({
                label: c.client_name ?? '—',
                value: c.total,
                note: c.total === 1 ? 'file' : 'files',
              }))}
            />
          </Panel>
        </div>
      )}

      <InboxPanel />
      <RecentActivity />
    </div>
  );
}
