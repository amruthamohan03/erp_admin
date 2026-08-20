// Small icon + label + value tile used in list page headers to
// surface stats endpoints (`/api/v1/<resource>/stats`). Extracted
// from quotations/page.tsx — now used by quotations, imports,
// exports, licenses and the audit log.

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
}

export default function StatCard({ icon, label, value, onClick, active, title }: StatCardProps) {
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
