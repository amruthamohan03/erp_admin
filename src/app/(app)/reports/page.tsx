'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar, ChevronRight } from 'lucide-react';

interface ReportSummary {
  id: number;
  reportKey: string;
  name: string;
  description: string | null;
  category: string | null;
  hasParameters: boolean;
  displayOrder: number;
}

export default function ReportsIndexPage() {
  const [reports, setReports] = React.useState<ReportSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/reports');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error?.message ?? 'Failed to load reports');
          return;
        }
        setReports(json.data);
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by category so finance / operations / compliance read as
  // separate sections — matches the §2 step 7 "surfaces across every
  // stage" framing.
  const grouped = React.useMemo(() => {
    const groups = new Map<string, ReportSummary[]>();
    for (const r of reports) {
      const cat = r.category ?? 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(r);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reports]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ChartBar className="h-6 w-6 text-primary-600" />
            Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Driven by <code>report_definition_master_t</code>; queries live in{' '}
            <code>src/reports/handlers/</code>.
          </p>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading reports…</div>}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="text-sm text-slate-500">
          No reports registered yet. Run <code>npm run db:seed</code>.
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([category, rows]) => (
          <section key={category}>
            <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map((r) => (
                <Link
                  key={r.reportKey}
                  href={`/reports/${r.reportKey}`}
                  className="card p-4 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{r.name}</div>
                      {r.description && (
                        <p className="text-sm text-slate-500 mt-1">
                          {r.description}
                        </p>
                      )}
                      <div className="text-xs text-slate-400 mt-2 flex items-center gap-3">
                        <code>{r.reportKey}</code>
                        {r.hasParameters && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            parameterized
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
