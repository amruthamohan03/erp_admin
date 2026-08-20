'use client';

// A bar strip, not a charting library — §3 forbids adding a top-level dependency
// for something this small, and CSS widths from theme tokens survive a theme
// switch for free (§4.20).

export default function AuditTrend({
  data,
  title,
  emptyMessage,
  formatKey,
}: {
  data: Array<{ key: string; count: number }>;
  title: string;
  emptyMessage: string;
  formatKey?: (key: string) => string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={d.key}>
                {formatKey ? formatKey(d.key) : d.key}
              </span>
              <span className="h-2 min-w-[2px] flex-1 rounded-full bg-border">
                <span
                  className="block h-2 rounded-full bg-primary-500"
                  style={{ width: `${max > 0 ? Math.round((d.count / max) * 100) : 0}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-xs font-medium text-foreground">
                {d.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
