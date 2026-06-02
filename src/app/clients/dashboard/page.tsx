'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, CheckCircle2, Calendar, Clock, ShieldCheck, FileCheck, FileText, AlertCircle,
  Sun, FileSpreadsheet, BarChart3, CreditCard,
  // Add icons here as new dashboard_card_master_t rows reference them.
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import { safeFetchJson } from '@/lib/safeFetch';

// ============================================================================
// Types — match the wire shape returned by /api/dashboard-cards/me and
// /api/clients/dashboard.
// ============================================================================

interface DashboardCard {
  id: number;
  card_key: string;
  card_content_id: string;
  card_title: string;
  card_subtitle: string | null;
  card_icon: string | null;
  card_color: string | null;
  card_url: string | null;
  card_category: string | null;
  data_source: string | null;
}

interface ChartPayload {
  client_type_distribution: Array<{ label: string; value: number }>;
  location_distribution: Array<{ label: string; value: number }>;
  payment_term_distribution: Array<{ label: string; value: number }>;
  monthly_registration_trend: Array<{ month: string; value: number }>;
}

// ============================================================================
// Card-color → gradient class. Keys are short semantic names stored in
// dashboard_card_master_t.card_color so admins can pick from a small palette
// instead of pasting full Tailwind class strings.
// ============================================================================

const COLOR_GRADIENTS: Record<string, string> = {
  violet:  'from-violet-500 to-indigo-600',
  emerald: 'from-emerald-500 to-green-600',
  amber:   'from-amber-400 to-orange-500',
  rose:    'from-rose-500 to-pink-600',
  slate:   'from-slate-700 to-slate-900',
  sky:     'from-sky-500 to-cyan-600',
  green:   'from-emerald-500 to-green-600',
  red:     'from-rose-500 to-red-600',
  primary: 'from-indigo-500 to-purple-600',
};

// ============================================================================
// Icon registry. Keys mirror lucide-react export names so card_icon can store
// `'Users'`, `'CheckCircle2'`, etc. — no Bootstrap-icon→lucide translation table.
// ============================================================================

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Users, CheckCircle2, Calendar, Clock,
  FileCheck, ShieldCheck, FileText, AlertCircle,
};

const CHART_COLORS = [
  '#6366f1', '#10b981', '#06b6d4', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#22c55e',
];

// ============================================================================
// data_source resolution: format is `<endpoint>#<json-path>`. Cards are
// grouped by endpoint so each one is fetched only once.
// ============================================================================

function parseDataSource(src: string | null): { endpoint: string; path: string } | null {
  if (!src) return null;
  const hash = src.indexOf('#');
  if (hash === -1) return { endpoint: src, path: '' };
  return { endpoint: src.slice(0, hash), path: src.slice(hash + 1) };
}

function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ============================================================================
// Page
// ============================================================================

export default function ClientDashboardPage() {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [dataByEndpoint, setDataByEndpoint] = useState<Record<string, unknown>>({});
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    // 1) Fetch the user's visible cards. /me already filters by role.
    const cardsRes = await safeFetchJson<DashboardCard[]>('/api/dashboard-cards/me');
    if (!cardsRes.ok) {
      setError([cardsRes.message, cardsRes.detail].filter(Boolean).join(' — '));
      setLoading(false);
      return;
    }
    const myCards = cardsRes.data.filter((c) => c.card_category === 'client_dashboard');
    setCards(myCards);

    // 2) Collect distinct endpoints across all the cards and fetch each once.
    //    Always include the dashboard data endpoint so the charts have data.
    const endpoints = new Set<string>(['/api/clients/dashboard']);
    for (const c of myCards) {
      const parsed = parseDataSource(c.data_source);
      if (parsed) endpoints.add(parsed.endpoint);
    }

    const dataMap: Record<string, unknown> = {};
    await Promise.all(
      Array.from(endpoints).map(async (ep) => {
        const r = await safeFetchJson(ep);
        if (r.ok) dataMap[ep] = r.data;
      }),
    );
    setDataByEndpoint(dataMap);
    setChartData((dataMap['/api/clients/dashboard'] as ChartPayload | undefined) ?? null);

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

      {!loading && !error && (
        <>
          {/* ---- Cards from dashboard_card_master_t ---- */}
          {cards.length === 0 ? (
            <div className="card p-6 text-center text-slate-500 mb-5">
              No dashboard cards are mapped to your role in this category. Configure them via
              <code className="ml-1 mr-1">/masters/dashboard-cards</code>
              and <code>/mapping/roletodashboardcard</code>.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              {cards.map((card) => {
                const parsed = parseDataSource(card.data_source);
                const raw = parsed
                  ? resolvePath(dataByEndpoint[parsed.endpoint], parsed.path)
                  : null;
                const value: number | string =
                  typeof raw === 'number' || typeof raw === 'string' ? raw : '—';
                return (
                  <CardTile
                    key={card.id}
                    title={card.card_title}
                    subtitle={card.card_subtitle}
                    value={value}
                    iconName={card.card_icon}
                    colorName={card.card_color}
                    href={card.card_url}
                  />
                );
              })}
            </div>
          )}

          {/* ---- Charts (still driven by /api/clients/dashboard) ---- */}
          {chartData && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                <DonutCard title="Client Type Distribution" data={chartData.client_type_distribution} variant="donut" />
                <BarCard   title="Location Distribution"     data={chartData.location_distribution} />
                <DonutCard title="Payment Terms"             data={chartData.payment_term_distribution} variant="pie" />
              </div>

              <div className="card p-4 mb-5">
                <h3 className="font-semibold text-slate-800 mb-3">Monthly Registration Trend</h3>
                <MonthlyTrend data={chartData.monthly_registration_trend} />
              </div>
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}

// ============================================================================
// CardTile — one tile per dashboard_card_master_t row
// ============================================================================

function CardTile({
  title, subtitle, value, iconName, colorName, href,
}: {
  title: string;
  subtitle: string | null;
  value: number | string;
  iconName: string | null;
  colorName: string | null;
  href: string | null;
}) {
  const Icon = (iconName && ICONS[iconName]) || CreditCard;
  const gradient = (colorName && COLOR_GRADIENTS[colorName]) || COLOR_GRADIENTS.primary;
  const inner = (
    <div className={`rounded-xl bg-gradient-to-br ${gradient} text-white p-5 shadow-sm relative overflow-hidden h-full transition hover:shadow-md`}>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-4xl font-bold leading-none">{value}</div>
      <div className="text-sm mt-2 opacity-90">{title}</div>
      {subtitle && <div className="text-xs mt-1 opacity-75">{subtitle}</div>}
    </div>
  );
  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return inner;
}

// ============================================================================
// Donut / Pie chart
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
  const strokeWidth = variant === 'donut' ? 30 : 70;
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
        const midAngle = ((offset + length / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
        const labelRadius = variant === 'donut' ? radius : radius * 0.6;
        const labelX = cx + Math.cos(midAngle) * labelRadius;
        const labelY = cy + Math.sin(midAngle) * labelRadius;
        const showLabel = portion >= 0.05;
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
// Horizontal bar chart
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
// Monthly trend
// ============================================================================

function MonthlyTrend({ data }: { data: Array<{ month: string; value: number }> }) {
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
            <div className="text-[10px] text-slate-500">{monthLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
