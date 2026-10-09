'use client';

import Link from 'next/link';
import { gradient } from '@/components/ui/cardGradient';

// The three pieces every tracking-dashboard panel is built from.
//
// Shared by the Export Tracking dashboard and anything else built on
// `TrackingDashboardView`. The Import dashboard reproduces an uploaded design
// and has its own language in `importDashboard/ui.tsx`. Every colour here is a
// token or a stated semantic pair (§4.20, §4.32).

export const nf = new Intl.NumberFormat('en-US');
export const nf2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A labelled proportion bar. Width is the only thing that varies. */
export function Bar({
  value,
  max,
  tone = 'primary',
}: {
  value: number;
  max: number;
  tone?: 'primary' | 'warning' | 'success' | 'danger';
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill =
    tone === 'warning'
      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
      : tone === 'success'
        ? 'bg-gradient-to-r from-emerald-500 to-green-500'
        : tone === 'danger'
          ? 'bg-gradient-to-r from-rose-500 to-red-500'
          : 'bg-gradient-to-r from-indigo-500 to-violet-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  /** A control that belongs to this panel, e.g. its own Export. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A KPI tile. With `href` it is reachable — clicking filters the list to exactly
 * the rows it counted (§4.29). Without one it is a plain figure, because no list
 * filter expresses it and a link that narrowed to something else would lie.
 */
export function Tile({
  label,
  value,
  sub,
  color,
  icon,
  href,
}: {
  label: string;
  value: string | number;
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
      <div className="mt-2 truncate text-2xl font-bold text-white" title={String(value)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-white/80">{sub}</div>}
    </>
  );
  const className = `card bg-gradient-to-br ${gradient(color)} p-4`;
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${className} transition-transform hover:scale-[1.02]`}
      title={`Show ${label.toLowerCase()}`}
    >
      {body}
    </Link>
  );
}
