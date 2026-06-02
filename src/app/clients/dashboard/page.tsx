'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, CheckCircle2, Calendar, Clock, ShieldCheck, FileCheck, FileText, AlertCircle,
  Sun, FileSpreadsheet, BarChart3,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import { safeFetchJson } from '@/lib/safeFetch';

interface DashboardPayload {
  stats: {
    total_clients: number;
    active_clients: number;
    this_month: number;
    today: number;
    verified: number;
    approved: number;
    valid_contracts: number;
    expired: number;
  };
  client_type_distribution: Array<{ label: string; value: number }>;
  location_distribution: Array<{ label: string; value: number }>;
  payment_term_distribution: Array<{ label: string; value: number }>;
  monthly_registration_trend: Array<{ month: string; value: number }>;
}

// Stat-card gradient palette mirroring the screenshot.
const STAT_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-emerald-500 to-green-600',
  'from-amber-400 to-orange-500',
  'from-rose-500 to-pink-600',
  'from-slate-700 to-slate-900',
  'from-sky-500 to-cyan-600',
  'from-emerald-500 to-green-600',
  'from-rose-500 to-red-600',
] as const;

// Chart palette — distinct, accessible.
const CHART_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#22c55e', // green
];

export default function ClientDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await safeFetchJson<DashboardPayload>('/api/clients/dashboard');
    if (result.ok) {
      setData(result.data);
    } else {
      setError([result.message, result.detail ? `Detail: ${result.detail}` : null].filter(Boolean).join(' — '));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      {/* ---- Hero header card ---- */}
      <div className="card p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Client Dashboard</h1>
            <p className="text-sm text-slate-500">Real-time insights and analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Toggle theme (placeholder)"
            disabled
            className="h-9 w-9 rounded-md border border-slate-200 text-slate-400 inline-flex items-center justify-center"
          >
            <Sun className="h-4 w-4" />
          </button>
          <a
            href="/api/clients/export-all"
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 text-sm font-medium shadow-sm transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </a>
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-sm font-medium shadow-sm transition"
          >
            <Users className="h-4 w-4" />
            Clients
          </Link>
        </div>
      </div>

      {loading && (
        <div className="card p-6 text-center text-slate-500">Loading dashboard...</div>
      )}

      {!loading && error && (
        <div className="rounded-md bg-red-50 p-3 mb-4 text-sm text-red-700 border border-red-200 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ---- Stat cards (2 rows of 4) ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Total Clients"   value={data.stats.total_clients}   icon={<Users   className="h-6 w-6" />} gradient={STAT_GRADIENTS[0]} />
            <StatCard label="Active Clients"  value={data.stats.active_clients}  icon={<CheckCircle2 className="h-6 w-6" />} gradient={STAT_GRADIENTS[1]} />
            <StatCard label="This Month"      value={data.stats.this_month}      icon={<Calendar className="h-6 w-6" />} gradient={STAT_GRADIENTS[2]} />
            <StatCard label="Today"           value={data.stats.today}           icon={<Clock    className="h-6 w-6" />} gradient={STAT_GRADIENTS[3]} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Verified"        value={data.stats.verified}        icon={<FileCheck   className="h-6 w-6" />} gradient={STAT_GRADIENTS[4]} />
            <StatCard label="Approved"        value={data.stats.approved}        icon={<ShieldCheck className="h-6 w-6" />} gradient={STAT_GRADIENTS[5]} />
            <StatCard label="Valid Contracts" value={data.stats.valid_contracts} icon={<FileText    className="h-6 w-6" />} gradient={STAT_GRADIENTS[6]} />
            <StatCard label="Expired"         value={data.stats.expired}         icon={<AlertCircle className="h-6 w-6" />} gradient={STAT_GRADIENTS[7]} />
          </div>

          {/* ---- Distribution charts ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <DonutCard title="Client Type Distribution" data={data.client_type_distribution} variant="donut" />
            <BarCard   title="Location Distribution"     data={data.location_distribution} />
            <DonutCard title="Payment Terms"             data={data.payment_term_distribution} variant="pie" />
          </div>

          {/* ---- Monthly registration trend ---- */}
          <div className="card p-4 mb-5">
            <h3 className="font-semibold text-slate-800 mb-3">Monthly Registration Trend</h3>
            <MonthlyTrend data={data.monthly_registration_trend} />
          </div>
        </>
      )}
    </DashboardShell>
  );
}

// ============================================================================
// Stat card
// ============================================================================

function StatCard({
  label, value, icon, gradient,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: typeof STAT_GRADIENTS[number];
}) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradient} text-white p-5 shadow-sm relative overflow-hidden`}>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">
        {icon}
      </div>
      <div className="text-4xl font-bold leading-none">{value}</div>
      <div className="text-sm mt-2 opacity-90">{label}</div>
    </div>
  );
}

// ============================================================================
// Donut / Pie chart card
// ============================================================================

function DonutCard({
  title, data, variant,
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
  variant: 'donut' | 'pie';
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No data</p>
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
  data: Array<{ label: string; value: number }>;
  total: number;
  variant: 'donut' | 'pie';
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const strokeWidth = variant === 'donut' ? 30 : 70; // 'pie' = full radius
  const innerRadius = variant === 'donut' ? radius - strokeWidth / 2 : 0;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const portion = d.value / total;
        const length = portion * circumference;
        const percent = (portion * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];

        // Compute label position — midpoint of arc, projected onto radius.
        const midAngle = ((offset + length / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
        const labelRadius = variant === 'donut' ? radius : radius * 0.6;
        const labelX = cx + Math.cos(midAngle) * labelRadius;
        const labelY = cy + Math.sin(midAngle) * labelRadius;
        const showLabel = portion >= 0.05; // hide tiny slices' labels

        const seg = (
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
        offset += length;
        return seg;
      })}
      {variant === 'donut' && (
        <circle cx={cx} cy={cy} r={innerRadius} fill="white" />
      )}
    </svg>
  );
}

// ============================================================================
// Horizontal bar chart card
// ============================================================================

function BarCard({
  title, data,
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No data</p>
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
// Monthly trend mini-chart (vertical bars)
// ============================================================================

function MonthlyTrend({ data }: { data: Array<{ month: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const h = (d.value / max) * 100;
        const monthLabel = d.month.slice(5); // "YYYY-MM" → "MM"
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
            <div className="text-[10px] text-slate-500">{monthLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
