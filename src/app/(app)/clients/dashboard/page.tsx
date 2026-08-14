'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, BarChart3, Sun, FileSpreadsheet } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

// Client dashboard — visual parity with main's /clients/dashboard.
// Stat cards on top come from card_category='client_dashboard'
// (rendered by DashboardCardsGrid); the chart row + monthly trend
// below are driven by the aggregate payload of
// /api/v1/clients/dashboard.

interface Distribution {
  label: string;
  value: number;
}

interface MonthlyPoint {
  month: string;
  value: number;
}

interface ChartPayload {
  client_type_distribution: Distribution[];
  location_distribution: Distribution[];
  payment_term_distribution: Distribution[];
  monthly_registration_trend: MonthlyPoint[];
}

const CHART_COLORS = [
  '#6366f1', '#10b981', '#06b6d4', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#22c55e',
];

export default function ClientsDashboardPage() {
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/clients/dashboard');
        const json = await res.json();
        if (cancelled) return;
        if (json?.ok) {
          setChartData(json.data as ChartPayload);
        } else {
          setError(json?.error?.message ?? 'Failed to load dashboard');
        }
      } catch {
        if (!cancelled) setError('Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* ---- Hero header card ---- */}
      <div className="card p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Client Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time insights and analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Toggle theme (placeholder)"
            disabled
            className="h-9 w-9 rounded-md border border-slate-200 text-muted-foreground inline-flex items-center justify-center"
          >
            <Sun className="h-4 w-4" />
          </button>
          <a
            href="/api/v1/clients/export"
            className="btn-excel btn-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </a>
          <Link
            href="/masters/clients"
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-sm font-medium shadow-sm transition"
          >
            <Users className="h-4 w-4" />
            Clients
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 mb-4 text-sm text-red-700 border border-red-200 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* ---- Cards from dashboard_card_master_t ---- */}
      <div className="mb-5">
        <DashboardCardsGrid category="client_dashboard" />
      </div>

      {loading && (
        <div className="card p-6 text-center text-muted-foreground">Loading dashboard...</div>
      )}

      {/* ---- Charts (driven by /api/v1/clients/dashboard) ---- */}
      {!loading && chartData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <DonutCard title="Client Type Distribution" data={chartData.client_type_distribution} variant="donut" />
            <BarCard title="Location Distribution" data={chartData.location_distribution} />
            <DonutCard title="Payment Terms" data={chartData.payment_term_distribution} variant="pie" />
          </div>

          <div className="card p-4 mb-5">
            <h3 className="font-semibold text-slate-800 mb-3">Monthly Registration Trend</h3>
            <MonthlyTrend data={chartData.monthly_registration_trend} />
          </div>
        </>
      )}
    </>
  );
}

// ============================================================================
// Donut / Pie chart
// ============================================================================

function DonutCard({
  title, data, variant,
}: {
  title: string;
  data: Distribution[];
  variant: 'donut' | 'pie';
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No data</p>
      ) : (
        <>
          <div className="flex justify-center mb-3">
            <DonutSvg data={data} total={total} variant={variant} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {data.map((d, i) => (
              <div key={d.label} className="inline-flex items-center gap-1 text-xs text-slate-700">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DonutSvg({
  data, total, variant,
}: {
  data: Distribution[];
  total: number;
  variant: 'donut' | 'pie';
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const strokeWidth = variant === 'donut' ? 30 : 70;
  const innerRadius = variant === 'donut' ? radius - strokeWidth / 2 : 0;
  const circumference = 2 * Math.PI * radius;

  // Precompute each segment's arc length and its cumulative start
  // offset without mutating a render-scoped accumulator (keeps the
  // React-compiler immutability rule happy).
  const lengths = data.map((d) => (d.value / total) * circumference);
  const offsets = lengths.map((_, i) =>
    lengths.slice(0, i).reduce((a, b) => a + b, 0),
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const portion = d.value / total;
        const length = lengths[i];
        const offset = offsets[i];
        const percent = (portion * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const midAngle = ((offset + length / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
        const labelRadius = variant === 'donut' ? radius : radius * 0.6;
        const labelX = cx + Math.cos(midAngle) * labelRadius;
        const labelY = cy + Math.sin(midAngle) * labelRadius;
        const showLabel = portion >= 0.05;
        return (
          <g key={d.label}>
            <circle
              cx={cx} cy={cy} r={radius}
              fill="transparent"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {showLabel && (
              <text
                x={labelX} y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="11"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {percent}%
              </text>
            )}
          </g>
        );
      })}
      {variant === 'donut' && (
        <circle cx={cx} cy={cy} r={innerRadius} fill="white" />
      )}
    </svg>
  );
}

// ============================================================================
// Horizontal bar chart
// ============================================================================

function BarCard({
  title, data,
}: {
  title: string;
  data: Distribution[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No data</p>
      ) : (
        <div className="space-y-3">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-28 text-xs text-slate-700 text-right truncate" title={d.label}>
                {d.label}
              </span>
              <div className="flex-1 h-7 bg-slate-100 rounded relative overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-2 text-xs text-white font-medium"
                  style={{
                    width: `${(d.value / max) * 100}%`,
                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    minWidth: '2rem',
                  }}
                >
                  {d.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Monthly trend
// ============================================================================

function MonthlyTrend({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const h = (d.value / max) * 100;
        const monthLabel = d.month.slice(5);
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="text-[10px] text-slate-600">{d.value}</div>
            <div className="w-full bg-slate-100 rounded-t" style={{ height: '100%' }}>
              <div
                className="bg-gradient-to-t from-indigo-500 to-violet-400 rounded-t"
                style={{ height: `${h}%`, minHeight: d.value > 0 ? '4px' : '0' }}
                title={`${d.month}: ${d.value}`}
              />
            </div>
            <div className="text-[10px] text-muted-foreground">{monthLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
