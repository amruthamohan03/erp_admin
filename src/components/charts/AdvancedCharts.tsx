'use client';

import { areaPath, funnelWidths, niceMax, plotPoints, smoothPath, stackSeries } from '@/lib/charts/geometry';
import {
  AXIS_TEXT,
  GRID,
  Grid,
  Legend,
  Plot,
  XLabels,
  chartColor,
  type CartesianProps,
  type HBarItem,
} from './Charts';

// §4.29 — the shapes that answer a question the basic forms answer poorly.
//
// A second file rather than a longer one: `Charts.tsx` holds the four everyday
// forms (line, area, bar, doughnut) and this holds the ones chosen for a
// specific reading — composition over time, completion, rank, and a pipeline.
// Both share one set of axes, colours and legend (§4.10), which is why those
// are exported from there rather than copied here.

/**
 * Bands stacked on one another over time — total volume AND its composition.
 *
 * Better than separate lines when the question is "how much work came in, and
 * of what kind": the top edge is the total, which a multi-line chart makes the
 * reader add up by eye.
 */
export function StackedAreaChart({ labels, series, height = 150, format }: CartesianProps) {
  const width = 320;
  const tops = stackSeries(series.map((s) => s.values));
  const max = niceMax(tops.at(-1) ?? []);
  const slot = width / Math.max(1, labels.length);

  return (
    <div>
      <Plot height={height} width={width}>
        <Grid max={max} width={width} height={height} />
        <XLabels labels={labels} width={width} height={height} />
        {/* Drawn from the TOP band down, so each fill covers the one behind it
            and the visible slice is exactly that series' own contribution. */}
        {tops
          .map((top, si) => ({ top, si }))
          .reverse()
          .map(({ top, si }) => {
            const pts = plotPoints(top, width, height, max);
            const id = `stack-${si}`;
            return (
              <g key={series[si].label}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor(si)} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={chartColor(si)} stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <path d={areaPath(pts, height)} fill={`url(#${id})`} stroke="none" />
                <path d={smoothPath(pts)} fill="none" stroke={chartColor(si)} strokeWidth={1.5} />
              </g>
            );
          })}
        {/* Hit targets last, so they sit above every fill and one hover names
            every series at that month rather than whichever band is on top. */}
        {labels.map((l, i) => (
          <rect key={`${l}-${i}`} x={slot * i} y={0} width={slot} height={height} fill="transparent">
            <title>
              {`${l} — ${series
                .map((s) => `${s.label}: ${format ? format(s.values[i] ?? 0) : (s.values[i] ?? 0)}`)
                .join(', ')}`}
            </title>
          </rect>
        ))}
      </Plot>
      <Legend series={series.map((s, i) => ({ label: s.label, color: chartColor(i) }))} />
    </div>
  );
}

/**
 * A progress ring — "how much of this is done".
 *
 * The right shape for a completion figure: the GAP is the outstanding work, so
 * the thing needing attention is the thing you see. A bar answers the same
 * question but reads as a quantity rather than as progress.
 */
export function GaugeRing({
  label,
  done,
  total,
  size = 112,
  thickness = 11,
  colorIndex = 0,
}: {
  label: string;
  done: number;
  total: number;
  size?: number;
  thickness?: number;
  colorIndex?: number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={GRID} strokeWidth={thickness} />
        {fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={chartColor(colorIndex)}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${fraction * circumference} ${circumference}`}
            // Starts at twelve o'clock; without this it begins at three and
            // the ring reads as rotated.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          >
            <title>{`${label}: ${done} of ${total} validated`}</title>
          </circle>
        )}
        {/* An em dash, not 0%, when there is nothing to measure — "none raised"
            and "none validated" are different facts. */}
        <text
          x={size / 2}
          y={size / 2 - 1}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={18}
          fontWeight={700}
        >
          {total > 0 ? `${Math.round(fraction * 100)}%` : '—'}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize={9} fill={AXIS_TEXT}>
          {done} of {total}
        </text>
      </svg>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}

/**
 * Concentric arcs, longest outermost — a ranked comparison with some presence.
 *
 * Each ring is scaled against the LEADER, so the top entry is a full circle and
 * the rest are read against it. The values are listed beside it, because an arc
 * is good at "who is biggest" and poor at "by exactly how much".
 */
export function RadialBars({
  items,
  format,
  size = 180,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: HBarItem[];
  format?: (v: number) => string;
  size?: number;
  emptyLabel?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  // Five rings is the most that stays legible; past that the inner ones are a
  // few pixels across and the chart says less than the list beside it.
  const shown = items.slice(0, 5);
  const max = Math.max(1, ...shown.map((i) => (Number.isFinite(i.value) ? i.value : 0)));
  const thickness = Math.max(7, (size / 2 - 18) / shown.length - 4);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" className="shrink-0">
        {shown.map((item, i) => {
          const radius = size / 2 - 10 - i * (thickness + 4);
          if (radius <= thickness / 2) return null;
          const circumference = 2 * Math.PI * radius;
          const fraction = Math.max(0, item.value) / max;
          return (
            <g key={`${item.label}-${i}`}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={GRID} strokeWidth={thickness} />
              {fraction > 0 && (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color ?? chartColor(i)}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  strokeDasharray={`${fraction * circumference} ${circumference}`}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                >
                  <title>{`${item.label}: ${format ? format(item.value) : item.value}`}</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {shown.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: item.color ?? chartColor(i) }}
              />
              <span className="truncate text-foreground" title={item.label}>
                {item.label}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {format ? format(item.value) : item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A tapering funnel — ordered stages, widest first.
 *
 * Right where the bands are SEQUENTIAL and narrowing carries meaning: time to
 * expiry reads as a deadline approaching rather than as unrelated categories.
 */
export function FunnelChart({
  items,
  format,
  bandHeight = 34,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: HBarItem[];
  format?: (v: number) => string;
  bandHeight?: number;
  emptyLabel?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  const width = 320;
  const gap = 4;
  const bands = funnelWidths(items.map((i) => i.value));
  const total = bands.length * (bandHeight + gap);

  return (
    <svg
      viewBox={`0 0 ${width} ${total}`}
      className="h-auto w-full"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {bands.map((band, i) => {
        const y = i * (bandHeight + gap);
        const topW = band.top * width;
        const botW = band.bottom * width;
        // A trapezoid from this band's width down to the next one's.
        const d = [
          `M${(width - topW) / 2} ${y}`,
          `L${(width + topW) / 2} ${y}`,
          `L${(width + botW) / 2} ${y + bandHeight}`,
          `L${(width - botW) / 2} ${y + bandHeight}`,
          'Z',
        ].join(' ');
        return (
          <g key={`${items[i].label}-${i}`}>
            <path d={d} fill={items[i].color ?? chartColor(i)} opacity={0.92}>
              <title>{`${items[i].label}: ${format ? format(items[i].value) : items[i].value}`}</title>
            </path>
            {/* Labels sit OUTSIDE the taper at the edges, so a narrow band does
                not end up with text wider than the shape carrying it. */}
            <text x={10} y={y + bandHeight / 2 + 4} fontSize={11} fontWeight={500} className="fill-foreground">
              {items[i].label}
            </text>
            <text
              x={width - 10}
              y={y + bandHeight / 2 + 4}
              textAnchor="end"
              fontSize={12}
              fontWeight={700}
              className="fill-foreground"
            >
              {format ? format(items[i].value) : items[i].value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
