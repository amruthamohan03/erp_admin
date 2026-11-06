'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Layers,
  Send,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { AreaChart, BarChart } from '@/components/charts/Charts';
import { FunnelChart, GaugeRing, RadialBars, StackedAreaChart } from '@/components/charts/AdvancedCharts';
import { gradient } from '@/components/ui/cardGradient';
import { useFetchedData } from '@/lib/hooks/useFetchedData';
import { formatDate, todayIso, weekdayName } from '@/lib/formatDate';
import type { OverviewDashboard } from '@/db/queries/overviewDashboard';
import { NO_VALUE } from '@/lib/displayValue';

// §4.29 — the home dashboard.
//
// What used to live here was the card grid, which is really a set of report
// shortcuts; it now has its own screen as Excel Report. This answers the
// question somebody actually has when they sign in: where is the work, is it
// moving, and is anything about to lapse.
//
// Charts are plain SVG from `components/charts` — no charting dependency, which
// would need a question first (§12) — and every series colour is a `--chart-*`
// token carrying both themes (§4.20, §4.32). Text on the brand banner is white
// because the surface under it is a known colour in both themes (§4.32).

/** §4.38 — the band an operator must act on reads as urgent, not as series 4. */
const EXPIRY_HUE: Record<string, string> = {
  Expired: 'hsl(var(--chart-5))',
  'Within 7 days': 'hsl(var(--chart-4))',
  '8 – 30 days': 'hsl(var(--chart-2))',
  '31 – 60 days': 'hsl(var(--chart-1))',
  '61 – 90 days': 'hsl(var(--chart-3))',
};

const nf = new Intl.NumberFormat('en-US');
const nf2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Compact for an axis: 12 400 000 is unreadable on a tick, 12.4M is not. */
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

interface Me {
  full_name: string;
  username: string;
}

/** Morning / afternoon / evening, from the operator's own clock. */
function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** A figure on the banner — glass over the brand gradient. */
function HeroStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-sm">
      {/* No icon on a phone: two stats share a row there, and the icon is what
          would push the label into an ellipsis. */}
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 sm:flex">
        <Icon className="h-4 w-4 text-white" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-lg font-bold leading-tight text-white" title={value}>
          {value}
        </div>
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-white/75">{label}</div>
      </div>
    </div>
  );
}

/** Share of `part` in `whole`, as a whole percent; null when there is no whole. */
function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((Math.min(part, whole) / whole) * 100) : null;
}

/**
 * A KPI card: icon, figure and label on one line, then a bar for the share it
 * represents. Horizontal so six of them are a compact band rather than a wall
 * of mostly-empty boxes.
 */
function Tile({
  label,
  value,
  sub,
  color,
  icon: Icon,
  href,
  share,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: LucideIcon;
  href: string;
  /** Percent for the progress bar; omitted when the figure is not a share. */
  share?: number | null;
}) {
  const hue = gradient(color);
  return (
    <Link
      href={href}
      className="group card relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* A soft wash in the tile's hue — colour as a signal, not as the whole
          surface, so six tiles read as one set. */}
      <span
        className={`pointer-events-none absolute -end-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${hue} opacity-[0.12] blur-2xl transition-opacity duration-300 group-hover:opacity-25`}
        aria-hidden
      />
      <div className="relative flex items-center gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${hue} text-white shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3`}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-2xl font-bold leading-tight tracking-tight text-foreground" title={value}>
            {value}
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 self-start text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <div className="relative mt-4">
        {/* A figure that is not a share keeps an empty slot of the bar's
            height, so every card's footer line sits at the same height. */}
        {share === undefined ? (
          <div className="h-1.5" aria-hidden />
        ) : (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${hue} transition-[width] duration-700`}
              style={{ width: `${share ?? 0}%` }}
            />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate" title={sub}>
            {sub}
          </span>
          {share !== undefined && share !== null && (
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{share}%</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Panel({
  title,
  hint,
  icon: Icon,
  className = '',
  children,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`card flex flex-col rounded-2xl p-5 transition-shadow duration-200 hover:shadow-lg ${className}`}
    >
      <header className="flex items-start gap-3 border-b border-border pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </header>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

/**
 * A time-series chart drawn at the proportions of the screen it is on.
 *
 * The charts scale their viewBox to the panel width, so ONE viewBox cannot suit
 * both a phone and a two-thirds desktop panel: the wide one shrinks its type to
 * a few pixels on a phone, the narrow one blows it up to heading size on a
 * desktop.
 *
 * Drawn ONCE, sized by a media query — not twice with CSS hiding one. The
 * charts' SVG gradients have fixed ids, and with two copies in the page the
 * fill resolves to the copy that is `display: none`, so the area renders empty.
 * The server snapshot is the wide size; a phone re-renders after hydration.
 */
const NARROW_QUERY = '(max-width: 639px)';

function subscribeNarrow(onChange: () => void): () => void {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function WideChart({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) {
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
  return <>{children(narrow ? { width: 320, height: 170 } : { width: 600, height: 150 })}</>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export default function DashboardPage() {
  const { data, error } = useFetchedData<OverviewDashboard>('/api/v1/dashboard/overview');
  const { data: me } = useFetchedData<Me>('/api/v1/auth/me');

  const k = data?.kpi;
  const months = data?.monthly ?? [];
  const labels = months.map((m) => m.month_name);

  // The endpoint drops empty slices so a chart never draws an invisible arc;
  // the gauges want the zeroes back, because "0 of 4 validated" is exactly what
  // this panel is for saying.
  const invoiceValue = (label: string): number => data?.invoice_split.find((s) => s.label === label)?.value ?? 0;

  /** A side's denominator: everything raised on it, validated or not. */
  const invoiceTotal = (side: 'Import' | 'Export'): number =>
    invoiceValue(`${side} · validated`) + invoiceValue(`${side} · pending`);

  // The clock is read only once something has loaded — both requests are
  // browser-only, so the server render never sees a time that the browser
  // would then disagree with (a hydration mismatch).
  const ready = me !== null || data !== null;
  const today = ready ? todayIso() : null;
  const firstName = me ? (me.full_name || me.username).split(/\s+/)[0] : null;
  const openFiles = k ? k.imports_open + k.exports_open + k.locals_open : null;

  return (
    <div className="space-y-6">
      <section className="bg-brand-gradient relative overflow-hidden rounded-3xl p-6 text-white shadow-xl ring-1 ring-black/5 sm:p-8">
        {/* Decoration only: soft light blooms and a faint dot grid, all white
            over a surface that is a known colour in both themes (§4.32). */}
        <span
          className="pointer-events-none absolute -end-24 -top-28 h-80 w-80 rounded-full bg-white/15 blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-36 start-1/4 h-80 w-80 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/90 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              {today ? `${weekdayName(today)} · ${formatDate(today)}` : 'Dashboard'}
            </span>
            <h1 className="mt-3 truncate text-2xl font-bold tracking-tight sm:text-4xl" translate="no">
              {today && firstName ? `${greeting(new Date().getHours())}, ${firstName}` : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-sm text-white/80">
              Where the work is, whether it is moving, and what is about to lapse.
            </p>
          </div>
          
        </div>

        <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat icon={FolderOpen} label="Open files" value={openFiles === null ? '…' : nf.format(openFiles)} />
          <HeroStat icon={ShieldCheck} label="Active licences" value={k ? nf.format(k.licenses_active) : '…'} />
          <HeroStat icon={Building2} label="Active clients" value={k ? nf.format(k.clients_active) : '…'} />
          <HeroStat icon={UserCheck} label="Active users" value={k ? nf.format(k.users_active) : '…'} />
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {!data && !error && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-[7.5rem] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`card h-80 animate-pulse rounded-2xl bg-muted ${i === 0 ? 'xl:col-span-2' : ''}`}
              />
            ))}
          </div>
        </>
      )}

      {k && (
        <>
          <SectionLabel>Needs attention</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Tile
              label="Open Imports"
              value={nf.format(k.imports_open)}
              sub={`of ${nf.format(k.imports_total)} imports still open`}
              share={pct(k.imports_open, k.imports_total)}
              color="violet"
              icon={Boxes}
              href="/imports"
            />
            <Tile
              label="Open Exports"
              value={nf.format(k.exports_open)}
              sub={`of ${nf.format(k.exports_total)} exports still open`}
              share={pct(k.exports_open, k.exports_total)}
              color="sky"
              icon={Send}
              href="/exports"
            />
            <Tile
              label="Open Local"
              value={nf.format(k.locals_open)}
              sub={`of ${nf.format(k.locals_total)} local files still open`}
              share={pct(k.locals_open, k.locals_total)}
              color="teal"
              icon={Truck}
              href="/local"
            />
            <Tile
              label="Licences Expiring"
              value={nf.format(k.licenses_expiring)}
              sub={`${nf.format(k.licenses_active)} active · ${nf.format(k.licenses_expired)} expired`}
              share={pct(k.licenses_expiring, k.licenses_active)}
              color="amber"
              icon={FileCheck}
              href="/licenses?card=expiring"
            />
            <Tile
              label="Outstanding Payments"
              value={nf2.format(k.payments_open_amount)}
              sub={`${nf.format(k.payments_open)} request${k.payments_open === 1 ? '' : 's'} in approval`}
              color="rose"
              icon={Wallet}
              href="/payments"
            />
            <Tile
              label="Invoices to Validate"
              value={nf.format(k.invoices_pending)}
              sub={`${nf.format(k.invoices_validated)} already validated`}
              share={pct(k.invoices_pending, k.invoices_pending + k.invoices_validated)}
              color="fuchsia"
              icon={FileText}
              href="/export-invoices"
            />
          </div>
        </>
      )}

      {data && (
        <>
          <SectionLabel>Activity</SectionLabel>
          {/* Time series take two thirds of the row and the compact charts one
              third: a funnel or a ring drawn at full half-width is blown up
              until its labels are the size of a heading. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Stacked, not three lines: the top edge is the month's TOTAL
                workload, which separate lines make you add up by eye. */}
            <Panel
              className="xl:col-span-2"
              icon={Layers}
              title="Files opened"
              hint="All three tracking modules, stacked — the top edge is the month's total."
            >
              <WideChart>
                {(size) => (
                  <StackedAreaChart
                    {...size}
                    labels={labels}
                    format={(v) => nf.format(v)}
                    series={[
                      { label: 'Imports', values: months.map((m) => m.imports) },
                      { label: 'Exports', values: months.map((m) => m.exports) },
                      { label: 'Local', values: months.map((m) => m.locals) },
                    ]}
                  />
                )}
              </WideChart>
            </Panel>

            {/* Progress rings, not bars: validation is a completion figure, and
                on a ring the GAP is the outstanding work — the thing needing
                attention is the thing you see. */}
            <Panel icon={FileText} title="Invoice validation" hint="How much of each side has been validated.">
              {invoiceTotal('Import') + invoiceTotal('Export') === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices raised yet.</p>
              ) : (
                <div className="flex h-full flex-wrap items-center justify-around gap-6 py-2">
                  <GaugeRing
                    label="Import invoices"
                    done={invoiceValue('Import · validated')}
                    total={invoiceTotal('Import')}
                    size={124}
                    colorIndex={0}
                  />
                  <GaugeRing
                    label="Export invoices"
                    done={invoiceValue('Export · validated')}
                    total={invoiceTotal('Export')}
                    size={124}
                    colorIndex={1}
                  />
                </div>
              )}
            </Panel>

            {/* The "where is everything" panel — clearing status across all three
                modules at once, which no per-module screen can show. */}
            <Panel
              className="xl:col-span-2"
              icon={BarChart3}
              title="Clearing status by module"
              hint="Every file, grouped by the status master."
            >
              <WideChart>
                {(size) => (
                  <BarChart
                    {...size}
                    labels={data.status_split.map((s) => s.status ?? 'Not set')}
                    format={(v) => nf.format(v)}
                    series={[
                      { label: 'Imports', values: data.status_split.map((s) => s.imports) },
                      { label: 'Exports', values: data.status_split.map((s) => s.exports) },
                      { label: 'Local', values: data.status_split.map((s) => s.locals) },
                    ]}
                  />
                )}
              </WideChart>
            </Panel>

            {/* Concentric arcs — the leader is a full circle and the rest are read
                against it. The list beside it carries the exact figures, because
                an arc answers "who is biggest", not "by how much". */}
            <Panel icon={Building2} title="Busiest clients" hint="By open files right now, across all three modules.">
              <div className="flex h-full flex-col justify-center">
                <RadialBars
                  size={150}
                  format={(v) => nf.format(v)}
                  emptyLabel="Nothing open against any client."
                  items={data.top_clients.map((c) => ({
                    label: c.client_name || NO_VALUE,
                    value: c.total,
                  }))}
                />
              </div>
            </Panel>
          </div>

          <SectionLabel>Value &amp; compliance</SectionLabel>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              icon={TrendingUp}
              title="Declared value cleared"
              hint="Combined FOB per month, both sides."
            >
              <WideChart>
                {(size) => (
                  <AreaChart
                    {...size}
                    labels={(data.monthly_value ?? []).map((m) => m.month_name)}
                    format={(v) => compact.format(v)}
                    series={[{ label: 'FOB', values: (data.monthly_value ?? []).map((m) => m.fob) }]}
                  />
                )}
              </WideChart>
            </Panel>

            {/* Coloured by urgency rather than by series: an expired licence is
                blocking work now, and the band an operator must act on this week
                should not be the same hue as one three months out (§4.38's
                reading — stopped, waiting, fine). A funnel, because these bands
                are SEQUENTIAL: it reads as a deadline approaching rather than as
                unrelated categories. */}
            <Panel
              icon={CalendarClock}
              title="Licences by time to expiry"
              hint="Each licence counted once, in the band it falls in."
            >
              <FunnelChart
                bandHeight={34}
                format={(v) => nf.format(v)}
                emptyLabel="No active licences with an expiry date."
                items={data.expiry_outlook.map((o) => ({
                  label: o.label,
                  value: o.count,
                  color: EXPIRY_HUE[o.label] ?? 'hsl(var(--chart-3))',
                }))}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
