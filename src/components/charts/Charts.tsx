'use client';

import { areaPath, donutArcs, niceMax, plotPoints, smoothPath } from '@/lib/charts/geometry';

// §4.29 — the dashboard's charts, drawn as plain SVG.
//
// There is no charting dependency in this project and adding one needs a
// question first (§12), so these are hand-drawn — the same choice the clients
// and payments dashboards already made. The arithmetic lives in
// `lib/charts/geometry`, tested on its own; everything here is placement.
//
// Colour comes from `--chart-1..6` in globals.css, which carry BOTH themes
// (§4.20, §4.32). A Tailwind shade would have carried one, and §4.29 is
// explicit that a chart has to survive a theme switch. The grid is `--chart-grid`
// rather than `--border`: a rule under data must recede further than a card edge.

/** A series colour by index, wrapping so a seventh series is never invisible. */
export const chartColor = (i: number): string => `hsl(var(--chart-${(i % 6) + 1}))`;

const GRID = 'hsl(var(--chart-grid))';
const AXIS_TEXT = 'hsl(var(--muted-foreground))';

export interface Series {
  label: string;
  values: number[];
}

interface CartesianProps {
  labels: string[];
  series: Series[];
  height?: number;
  /** Formats the value in a point's tooltip. */
  format?: (v: number) => string;
}

/** Horizontal rules plus the value at each one — the plot's backdrop. */
function Grid({ max, width, height, steps = 4 }: { max: number; width: number; height: number; steps?: number }) {
  return (
    <g aria-hidden="true">
      {Array.from({ length: steps + 1 }, (_, i) => {
        const y = (height / steps) * i;
        const value = Math.round(max - (max / steps) * i);
        return (
          <g key={i}>
            <line x1={0} y1={y} x2={width} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={-8} y={y + 3} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ labels, width, height }: { labels: string[]; width: number; height: number }) {
  if (labels.length === 0) return null;
  const step = labels.length === 1 ? 0 : width / (labels.length - 1);
  return (
    <g aria-hidden="true">
      {labels.map((l, i) => (
        <text
          key={`${l}-${i}`}
          x={labels.length === 1 ? width / 2 : i * step}
          y={height + 14}
          textAnchor="middle"
          fontSize={9}
          fill={AXIS_TEXT}
        >
          {l}
        </text>
      ))}
    </g>
  );
}

function Legend({ series }: { series: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The plot area, inset so the axis labels have somewhere to live.
 *
 * `preserveAspectRatio="none"` is deliberately NOT used — stretching the
 * viewBox would distort the stroke widths and the type along with the plot.
 */
function Plot({
  children,
  height,
  width = 320,
}: {
  children: React.ReactNode;
  height: number;
  width?: number;
}) {
  return (
    <svg
      viewBox={`-26 -6 ${width + 36} ${height + 28}`}
      className="h-auto w-full"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  );
}

export function LineChart({ labels, series, height = 150, format }: CartesianProps) {
  const width = 320;
  const max = niceMax(series.flatMap((s) => s.values));
  return (
    <div>
      <Plot height={height} width={width}>
        <Grid max={max} width={width} height={height} />
        <XLabels labels={labels} width={width} height={height} />
        {series.map((s, si) => {
          const pts = plotPoints(s.values, width, height, max);
          return (
            <g key={s.label}>
              <path d={smoothPath(pts)} fill="none" stroke={chartColor(si)} strokeWidth={2} strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={chartColor(si)}>
                  <title>{`${labels[i] ?? ''} — ${s.label}: ${format ? format(s.values[i]) : s.values[i]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </Plot>
      <Legend series={series.map((s, i) => ({ label: s.label, color: chartColor(i) }))} />
    </div>
  );
}

export function AreaChart({ labels, series, height = 150, format }: CartesianProps) {
  const width = 320;
  const max = niceMax(series.flatMap((s) => s.values));
  return (
    <div>
      <Plot height={height} width={width}>
        <Grid max={max} width={width} height={height} />
        <XLabels labels={labels} width={width} height={height} />
        {series.map((s, si) => {
          const pts = plotPoints(s.values, width, height, max);
          const id = `area-${si}-${s.label.replace(/\W/gu, '')}`;
          return (
            <g key={s.label}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor(si)} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={chartColor(si)} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <path d={areaPath(pts, height)} fill={`url(#${id})`} stroke="none" />
              <path d={smoothPath(pts)} fill="none" stroke={chartColor(si)} strokeWidth={2} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2} fill={chartColor(si)}>
                  <title>{`${labels[i] ?? ''} — ${s.label}: ${format ? format(s.values[i]) : s.values[i]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </Plot>
      <Legend series={series.map((s, i) => ({ label: s.label, color: chartColor(i) }))} />
    </div>
  );
}

export function BarChart({ labels, series, height = 150, format }: CartesianProps) {
  const width = 320;
  const max = niceMax(series.flatMap((s) => s.values));
  const groups = labels.length || 1;
  const groupWidth = width / groups;
  // A visible gap between groups, and bars that never collapse to a hairline
  // however many series share a group.
  const barWidth = Math.max(2, (groupWidth * 0.62) / Math.max(1, series.length));

  return (
    <div>
      <Plot height={height} width={width}>
        <Grid max={max} width={width} height={height} />
        {labels.map((l, i) => (
          <text
            key={`${l}-${i}`}
            x={groupWidth * i + groupWidth / 2}
            y={height + 14}
            textAnchor="middle"
            fontSize={9}
            fill={AXIS_TEXT}
            aria-hidden="true"
          >
            {l}
          </text>
        ))}
        {series.map((s, si) =>
          s.values.map((v, i) => {
            const h = (Math.max(0, v) / max) * height;
            const x = groupWidth * i + groupWidth / 2 - (barWidth * series.length) / 2 + barWidth * si;
            return (
              <rect
                key={`${si}-${i}`}
                x={x}
                y={height - h}
                width={barWidth}
                height={h}
                rx={2}
                fill={chartColor(si)}
              >
                <title>{`${labels[i] ?? ''} — ${s.label}: ${format ? format(v) : v}`}</title>
              </rect>
            );
          }),
        )}
      </Plot>
      <Legend series={series.map((s, i) => ({ label: s.label, color: chartColor(i) }))} />
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
}

export function DonutChart({
  slices,
  size = 160,
  thickness = 26,
  format,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  format?: (v: number) => string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcs = donutArcs(slices.map((s) => s.value), circumference);
  const total = slices.reduce((sum, s) => sum + (s.value > 0 ? s.value : 0), 0);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" className="shrink-0">
        {/* The track, so an empty chart is a ring rather than nothing at all. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={GRID}
          strokeWidth={thickness}
        />
        {arcs.map((arc, i) =>
          arc.length <= 0 ? null : (
            <circle
              key={slices[i].label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={chartColor(i)}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={arc.offset}
              // Starts at twelve o'clock; without this the first slice begins
              // at three and the ring reads as rotated.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${slices[i].label}: ${format ? format(slices[i].value) : slices[i].value} (${Math.round(arc.fraction * 100)}%)`}</title>
            </circle>
          ),
        )}
        {/* The hole's label. No painted centre — the ring is a stroke, so the
            card's own background already shows through (a filled white circle
            was how the old donut broke in dark mode). */}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={18}
          fontWeight={700}
        >
          {format ? format(total) : total}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize={9} fill={AXIS_TEXT}>
          total
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: chartColor(i) }} />
              <span className="truncate" title={s.label}>{s.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-foreground">
              {format ? format(s.value) : s.value}
            </span>
          </li>
        ))}
        {slices.length === 0 && <li className="text-muted-foreground">Nothing to chart yet.</li>}
      </ul>
    </div>
  );
}

export interface HBarItem {
  label: string;
  value: number;
  /** Overrides the series colour — used where the bar carries a MEANING. */
  color?: string;
  /** Small text on the right of the label, e.g. a share or a breakdown. */
  note?: string;
}

/**
 * A ranked horizontal bar list.
 *
 * The right form for "which of these is biggest" — a leaderboard is read down
 * the labels, and a doughnut makes you match colours to a legend to answer the
 * same question. It also degrades gracefully: two entries look like two bars
 * rather than a circle cut in half, and one entry looks like one bar rather
 * than a full ring reading as "100% of this".
 */
export function HBarChart({
  items,
  format,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: HBarItem[];
  format?: (v: number) => string;
  emptyLabel?: string;
}) {
  // Scaled to the largest BAR, not the total: this compares entries with each
  // other, so the leader should fill the track.
  const max = Math.max(1, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)));

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const value = Number.isFinite(item.value) ? item.value : 0;
        const pct = (value / max) * 100;
        const color = item.color ?? chartColor(i);
        return (
          <li key={`${item.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-medium text-foreground" title={item.label}>
                  {item.label}
                </span>
                {item.note && <span className="shrink-0 text-[11px] text-muted-foreground">{item.note}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {format ? format(value) : value}
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                // A gradient ending lighter gives the bar some depth without a
                // second token; the base colour still carries both themes.
                style={{
                  width: `${Math.max(value > 0 ? 3 : 0, pct)}%`,
                  background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 62%, white))`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface StackSegment {
  label: string;
  value: number;
}

/**
 * One row per group, each split into segments — "how much of this is done".
 *
 * Used for invoices: a side is only interesting as validated-versus-pending, and
 * a doughnut of four slices makes you compare two pairs across a circle.
 */
export function StackedBars({
  groups,
  format,
  emptyLabel = 'Nothing to show yet.',
}: {
  groups: Array<{ label: string; segments: StackSegment[] }>;
  format?: (v: number) => string;
  emptyLabel?: string;
}) {
  const totals = groups.map((g) => g.segments.reduce((s, x) => s + Math.max(0, x.value), 0));
  const max = Math.max(1, ...totals);
  const legend = groups[0]?.segments.map((s, i) => ({ label: s.label, color: chartColor(i) })) ?? [];

  if (groups.length === 0 || totals.every((t) => t === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div>
      <ul className="space-y-3">
        {groups.map((g, gi) => (
          <li key={g.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground">{g.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {format ? format(totals[gi]) : totals[gi]}
              </span>
            </div>
            <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {g.segments.map((s, si) => {
                const w = (Math.max(0, s.value) / max) * 100;
                if (w <= 0) return null;
                return (
                  <div
                    key={s.label}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${w}%`, background: chartColor(si) }}
                    title={`${g.label} — ${s.label}: ${format ? format(s.value) : s.value}`}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} /> {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
