'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

// The Import dashboard's visual language, as a set of primitives.
//
// This reproduces the uploaded design: gradient KPI cards with a watermark
// icon, section headers, quarter and phase cards with a coloured top rule,
// gradient "export" tiles, bordered centre-aligned grids and the summary alert
// strip. One component per shape, used by all seven tabs, so the look cannot
// drift between them (§4.8, §4.10).
//
// On colour: every neutral is a token (`bg-card`, `text-foreground`,
// `border-border`), which is the faithful translation of the design's own
// `--bg-secondary` / `--text-primary` / `--border-color` variables — it defined
// a light and a dark value for each, exactly as our tokens do. The decorative
// fills stay Tailwind shades because they sit UNDER white text on a known
// coloured surface, which §4.32 permits for precisely this case; a token would
// have forced one hue where the design calls for nineteen.

export const nf = new Intl.NumberFormat('en-US');
export const nf2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** The nineteen card fills of the uploaded design, as gradient pairs. */
const FILL: Record<string, string> = {
  blue: 'from-[#667eea] to-[#764ba2]',
  green: 'from-[#10c469] to-[#0e9f5a]',
  orange: 'from-[#f9c851] to-[#f7a842]',
  red: 'from-[#fa5c7c] to-[#f83e5e]',
  purple: 'from-[#5b69bc] to-[#3f4d96]',
  cyan: 'from-[#35b8e0] to-[#2a9dc7]',
  teal: 'from-[#20c997] to-[#17a2b8]',
  indigo: 'from-[#6610f2] to-[#5a3baa]',
  pink: 'from-[#e83e8c] to-[#d63384]',
  dark: 'from-[#343a40] to-[#23272b]',
  warning: 'from-[#ffc107] to-[#ff9800]',
  sky: 'from-[#0ea5e9] to-[#0284c7]',
  lime: 'from-[#84cc16] to-[#65a30d]',
  amber: 'from-[#f59e0b] to-[#d97706]',
  emerald: 'from-[#10b981] to-[#059669]',
  violet: 'from-[#8b5cf6] to-[#7c3aed]',
  fuchsia: 'from-[#d946ef] to-[#c026d3]',
  rose: 'from-[#f43f5e] to-[#e11d48]',
  slate: 'from-[#64748b] to-[#475569]',
};

export type FillName = keyof typeof FILL;

export const fill = (name: string): string => FILL[name] ?? FILL.blue;

/** The flat accent of a fill, for a top rule, a big number or an icon. */
const ACCENT: Record<string, string> = {
  blue: '#667eea',
  green: '#10c469',
  orange: '#f9c851',
  red: '#ef4444',
  purple: '#5b69bc',
  cyan: '#35b8e0',
  teal: '#20c997',
  indigo: '#6610f2',
  pink: '#e83e8c',
  dark: '#343a40',
  warning: '#ffc107',
  sky: '#3b82f6',
  lime: '#84cc16',
  amber: '#f59e0b',
  emerald: '#10b981',
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  rose: '#f43f5e',
  slate: '#64748b',
};

export const accent = (name: string): string => ACCENT[name] ?? ACCENT.blue;

/**
 * A gradient KPI card: big figure, label, and the icon as a watermark.
 *
 * With `href` it is reachable — clicking filters the list to exactly the rows
 * it counted (§4.29). Without one it stays a plain figure rather than a link
 * that would narrow to something else.
 */
export function KpiCard({
  value,
  label,
  color,
  icon,
  href,
  sub,
  footer,
}: {
  value: string | number;
  label: string;
  color: string;
  icon: ReactNode;
  href?: string;
  sub?: string;
  /** A row of breakdown figures under the label, on the same surface. */
  footer?: ReactNode;
}) {
  const body = (
    <>
      <span className="pointer-events-none absolute right-3 top-2.5 text-white/25 [&>svg]:h-10 [&>svg]:w-10">
        {icon}
      </span>
      <div className="relative truncate pe-10 text-[1.75rem] font-bold leading-none text-white" title={String(value)}>
        {value}
      </div>
      <p className="relative mt-1.5 truncate text-[0.8rem] font-medium text-white/90" title={label}>
        {label}
      </p>
      {sub && <p className="relative truncate text-[0.7rem] leading-snug text-white/75" title={sub}>{sub}</p>}
      {footer && (
        <div className="relative mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem] text-white/85">
          {footer}
        </div>
      )}
    </>
  );
  const cls = `relative flex h-full flex-col justify-center overflow-hidden rounded-lg bg-gradient-to-br ${fill(
    color,
  )} p-4 shadow-sm transition-transform`;
  return href ? (
    <Link href={href} className={`${cls} block hover:-translate-y-1.5 hover:shadow-lg`} title={`Show ${label.toLowerCase()}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The label that separates one group of panels from the next.
 *
 * A rule and a title rather than a bordered card: it is a heading, and boxing
 * every heading cost ~90px of vertical space before any data and made the page
 * read as a stack of identical frames. The accent bar carries the same role the
 * design's border did, at a fraction of the height.
 */
export function SectionHeader({
  title,
  hint,
  icon,
  action,
  accentColor = 'blue',
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  accentColor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-7 w-1 shrink-0 rounded-full"
          style={{ background: accent(accentColor) }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold leading-tight text-foreground">
            {icon}
            {title}
          </h3>
          {hint && <p className="truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** A plain panel with the design's `header-title`. */
export function ChartCard({
  title,
  icon,
  action,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm ${className ?? ''}`}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {icon}
              {title}
            </h4>
          )}
          {action}
        </div>
      )}
      {/* min-h-0 so a chart inside can shrink rather than forcing the card
          taller than the row it shares. */}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The design's grid: every cell bordered and centre-aligned, a muted header
 * row, and a hover tint. Used where the panel is a read-only matrix of figures
 * rather than a list of records — a list of records is a `<DataTable>` (§4.25).
 */
export function GridTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Alignment as a lookup, not `text-${align}`: Tailwind scans source text, so a
 * class assembled at runtime is never emitted and the cell silently falls back
 * to the default alignment.
 */
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export function Th({
  children,
  align = 'center',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`border border-border bg-muted px-3 py-3 ${ALIGN[align]} font-bold text-foreground ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'center',
  className,
  title,
  colSpan,
}: {
  children?: ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  title?: string;
  /** For a totals row, where one cell spans the columns it does not total. */
  colSpan?: number;
}) {
  return (
    <td
      className={`border border-border px-3 py-2.5 ${ALIGN[align]} text-foreground ${className ?? ''}`}
      title={title}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}

export function Tr({ children, tone }: { children: ReactNode; tone?: 'total' | 'danger' }) {
  const cls =
    tone === 'total'
      ? 'border-t-2 border-t-sky-500 bg-sky-50 font-bold text-sky-800 dark:bg-sky-500/10 dark:text-sky-300'
      : tone === 'danger'
        ? 'bg-rose-50 dark:bg-rose-500/10'
        : 'hover:bg-muted/50';
  return <tr className={cls}>{children}</tr>;
}

/**
 * A card whose colour is a top rule rather than a fill — the shape the design
 * uses for a quarter, a phase and a tracking stage.
 */
export function AccentCard({
  color,
  icon,
  value,
  label,
  desc,
  badge,
  action,
  large,
}: {
  color: string;
  icon?: ReactNode;
  value: string | number;
  label: string;
  desc?: ReactNode;
  badge?: string;
  action?: ReactNode;
  /** The taller variant used for phases and tracking stages. */
  large?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 text-center shadow-sm transition-transform hover:-translate-y-1 ${
        large ? 'p-6' : 'p-5'
      }`}
    >
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent(color) }}
        aria-hidden="true"
      />
      {badge && (
        <span className="absolute right-3 top-3 rounded-full bg-muted px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
      {icon && (
        <div
          className={`mb-3 flex justify-center ${large ? '[&>svg]:h-9 [&>svg]:w-9' : '[&>svg]:h-8 [&>svg]:w-8'}`}
          style={{ color: accent(color) }}
        >
          {icon}
        </div>
      )}
      <div
        className={`font-black leading-none ${large ? 'text-4xl' : 'text-3xl'}`}
        style={{ color: accent(color) }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs font-bold uppercase tracking-wide text-foreground">{label}</div>
      {desc && <div className="mt-1.5 text-[0.7rem] font-semibold leading-snug text-muted-foreground">{desc}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * A gradient tile that downloads what it counts.
 *
 * `href` absent means there is nothing to download — the design's cards are
 * all clickable, but a card offering a spreadsheet of nothing reads as a broken
 * export, so a zero renders as a settled state instead.
 */
export function ExportTile({
  count,
  label,
  hint,
  color,
  icon,
  href,
  chip = 'Export',
  zeroLabel = 'all recorded',
}: {
  count: number;
  label: string;
  hint?: string;
  color: string;
  icon?: ReactNode;
  href?: string;
  chip?: string;
  zeroLabel?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span className="pointer-events-none absolute right-2 top-6 text-white/20 [&>svg]:h-11 [&>svg]:w-11">
          {icon}
        </span>
      )}
      {href && (
        <span className="absolute right-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
          {chip}
        </span>
      )}
      <div className="relative mt-auto text-[1.6rem] font-black leading-none text-white">
        {nf.format(count)}
      </div>
      <div className="relative truncate text-[0.8rem] font-semibold text-white/95" title={label}>
        {label}
      </div>
      <div className="relative truncate text-[0.68rem] text-white/80">
        {count === 0 ? zeroLabel : (hint ?? 'missing records')}
      </div>
    </>
  );
  const cls = `relative flex h-full min-h-[104px] flex-col justify-end overflow-hidden rounded-[10px] bg-gradient-to-br ${fill(
    color,
  )} p-3.5 shadow-sm transition-transform`;
  return href ? (
    <a
      href={href}
      className={`${cls} hover:-translate-y-1.5 hover:shadow-xl`}
      title={`Export the ${count} file${count === 1 ? '' : 's'} — ${label}`}
    >
      {inner}
    </a>
  ) : (
    <div className={`${cls} opacity-90`} title={`${label}: ${zeroLabel}`}>
      {inner}
    </div>
  );
}

/** A horizontally scrolling strip of small month cards. */
export function MiniCard({
  value,
  label,
  max,
  color = 'blue',
}: {
  value: number;
  label: string;
  max: number;
  color?: string;
}) {
  return (
    <div className="min-w-[116px] shrink-0 rounded-xl border border-border bg-card p-3 text-center shadow-sm transition-transform hover:-translate-y-0.5">
      <div className="text-xl font-black leading-none" style={{ color: accent(color) }}>
        {nf.format(value)}
      </div>
      <div className="mt-1 truncate text-[0.78rem] font-semibold text-muted-foreground" title={label}>
        {label}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-sm bg-muted">
        <div
          className="h-full rounded-sm"
          style={{
            width: `${max > 0 ? (value / max) * 100 : 0}%`,
            background: `linear-gradient(90deg, ${accent('blue')}, ${accent('purple')})`,
          }}
        />
      </div>
    </div>
  );
}

export function MiniCardStrip({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 overflow-x-auto px-0.5 py-2.5">{children}</div>;
}

/** One figure with its change against the previous period. */
export function YoyCard({
  value,
  label,
  change,
}: {
  value: string;
  label: string;
  change?: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      <div className="truncate text-2xl font-extrabold text-foreground" title={value}>
        {value}
      </div>
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      {change && (
        <div
          className={`mt-1 text-sm font-bold ${
            change.positive
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {change.text}
        </div>
      )}
    </div>
  );
}

/** The design's centred summary strip, in three readings. */
export function SummaryAlert({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: 'info' | 'success' | 'danger';
}) {
  const cls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
      : tone === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
        : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300';
  return (
    <div className={`rounded-md border px-4 py-3 text-center text-sm ${cls}`}>
      <strong className="font-bold">{typeof value === 'number' ? nf.format(value) : value}</strong>{' '}
      {label}
    </div>
  );
}

/** The segmented control the design uses to switch a chart's shape. */
export function ChartTypeSelector<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <div
      className="mx-auto mb-4 flex w-max gap-1 rounded-lg border border-border bg-muted/60 p-1"
      role="group"
      aria-label="Chart type"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              active
                ? 'bg-gradient-to-br from-[#5b69bc] to-[#3f4d96] text-white shadow'
                : 'text-foreground hover:bg-card'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A loading state in the design's own shape, not a bare spinner. */
export function TabSkeleton({ tiles = 4, panels = 2 }: { tiles?: number; panels?: number }) {
  return (
    <div className="space-y-5">
      {tiles > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {Array.from({ length: panels }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function TabError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

/** An empty panel reading, phrased as what is missing (§4.25). */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * A chart's slot, which decides the viewBox width to draw at.
 *
 * The chart svg is `h-auto w-full`, so its rendered height is the container's
 * width times the viewBox ratio. That is why a full-width panel given
 * `height={280}` on the default 320-wide viewBox rendered a chart roughly 900px
 * tall — and why the answer is a WIDER viewBox, not a shorter one:
 *
 *   <ChartBox span="full">{(w) => <BarChart width={w} height={200} … />}</ChartBox>
 *
 * There is deliberately no `maxHeight`. Capping the height meant
 * `overflow-hidden`, which CLIPS instead of scaling — and the x-axis labels sit
 * at the very bottom of the viewBox, so a cap of 300px against a 315px render
 * sliced the month names in half. The ratio is the only height control.
 */
export function ChartBox({
  span = 'half',
  children,
}: {
  /** `full` = a 12-column panel, `half` = one of a two-up pair. */
  span?: 'full' | 'half';
  children: (viewBoxWidth: number) => ReactNode;
}) {
  // Chosen so height/width lands near the panel's real aspect: a full-width
  // panel is roughly 5:1 at desktop, a half-width one roughly 2.4:1.
  const width = span === 'full' ? 1100 : 520;
  return <div className="w-full">{children(width)}</div>;
}

/**
 * A section heading bound to the content it labels.
 *
 * The heading and its grid were two siblings of the page's `space-y-6`, so the
 * gap between a heading and its own cards was the same as the gap between
 * groups — nothing visually belonged to anything. One element per group, with
 * its own tighter inner rhythm, is what makes the page read as sections.
 */
export function Group({
  title,
  hint,
  icon,
  action,
  accentColor,
  children,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  accentColor?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title={title}
        hint={hint}
        icon={icon}
        action={action}
        accentColor={accentColor}
      />
      {children}
    </section>
  );
}
