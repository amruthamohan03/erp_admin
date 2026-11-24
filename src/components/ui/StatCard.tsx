// Small icon + label + value tile used in list page headers to
// surface stats endpoints (`/api/v1/<resource>/stats`). Extracted
// from quotations/page.tsx — now used by quotations, imports,
// exports, licenses and the audit log.
//
// With `color` it becomes the large gradient KPI card (Import Synthesis,
// Import Apurement): the colour goes through the same `gradient()` map as the
// configured dashboard cards, so a colour name means the same hue everywhere.
// Text on it is white by design — the surface under it is a known colour in
// both themes (§4.32).
import { gradient } from './cardGradient';

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  /**
   * §4.29 — a KPI is reachable: clicking it filters the table below to exactly
   * the rows it counted. Omit and the tile stays a plain, non-interactive stat.
   */
  onClick?: () => void;
  /** Marks the tile whose filter is currently applied. */
  active?: boolean;
  /** Named for a screen reader when the tile is a button. */
  title?: string;
  /** A semantic colour name (`violet`, `emerald`, `amber`, …) — switches to the gradient card. */
  color?: string;
  /** Gradient card only — a second line under the label. */
  subtitle?: string;
  /** Gradient card only — a small prompt at the foot, e.g. what clicking does. */
  hint?: string;
}

export default function StatCard({ icon, label, value, onClick, active, title, color, subtitle, hint }: StatCardProps) {
  if (color) return <GradientCard {...{ icon, label, value, onClick, active, title, color, subtitle, hint }} />;

  const body = (
    <>
      <div className="h-10 w-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground truncate">{value}</div>
      </div>
    </>
  );

  if (!onClick) {
    return <div className="card p-4 flex items-center gap-3">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `Show ${label.toLowerCase()}`}
      aria-pressed={active}
      className={`card p-4 flex items-center gap-3 text-left transition hover:border-primary-400 ${
        active ? 'border-primary-500 ring-1 ring-primary-500' : ''
      }`}
    >
      {body}
    </button>
  );
}

function GradientCard({ icon, label, value, onClick, active, title, color, subtitle, hint }: StatCardProps & { color: string }) {
  const body = (
    <>
      {/* Decorative circles — pointer-transparent, behind the text. */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15" />
      <span aria-hidden className="pointer-events-none absolute -bottom-6 right-12 h-24 w-24 rounded-full bg-white/10" />
      <span aria-hidden className="absolute right-5 top-4 opacity-40 [&_svg]:h-10 [&_svg]:w-10">{icon}</span>

      <div className="relative min-w-0">
        <div className="truncate text-4xl font-extrabold leading-none tracking-tight tabular-nums">{value}</div>
        <div className="mt-2 truncate text-sm font-bold uppercase tracking-wide" title={label}>{label}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-white/85" title={subtitle}>{subtitle}</div>}
        {hint && <div className="mt-3 truncate text-xs text-white/75">{hint}</div>}
      </div>
    </>
  );

  const base = `relative overflow-hidden rounded-2xl p-5 text-left text-white shadow-md min-h-[8.5rem] bg-gradient-to-br ${gradient(color)}`;

  if (!onClick) return <div className={base}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `Show ${label.toLowerCase()}`}
      aria-pressed={active}
      className={`${base} transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        active ? 'ring-4 ring-primary-500/60 ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {body}
    </button>
  );
}
