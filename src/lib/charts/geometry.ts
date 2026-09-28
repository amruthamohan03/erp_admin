// §4.29 — the arithmetic behind the dashboard charts.
//
// Pure and separate from the components so the parts that can actually be wrong
// — a scale that divides by zero, a path that inverts because SVG's y axis
// grows downward, an arc that overshoots the circle — are unit-tested without a
// browser. The components then only place what these return.
//
// There is no charting dependency in this project and adding one needs a
// question first (§12), so the drawing is plain SVG. That is also why the
// geometry is worth testing: nothing else is checking it.

export interface Point {
  x: number;
  y: number;
}

/**
 * The upper bound a chart scales to.
 *
 * Never zero, so an empty series draws a flat line along the floor rather than
 * dividing by zero and rendering `NaN` into the path — which SVG silently drops,
 * leaving a blank card with no hint that anything is wrong.
 */
export function niceMax(values: readonly number[]): number {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (max <= 0) return 1;
  // Round up to something a human would label an axis with: 1, 2 or 5 × 10ⁿ.
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalised = max / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Evenly spaced points across the plot, with y INVERTED.
 *
 * SVG's y axis grows downward, so a value of zero belongs at `height`, not at
 * 0. Getting this backwards draws a chart that is upside down but otherwise
 * plausible, which is the kind of wrong nobody notices in a screenshot.
 */
export function plotPoints(
  values: readonly number[],
  width: number,
  height: number,
  max = niceMax(values),
): Point[] {
  if (values.length === 0) return [];
  // One point still has to land somewhere: put it mid-plot rather than at x=NaN.
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : i * step,
    y: height - (Math.max(0, v) / max) * height,
  }));
}

/** A polyline through the points — the line chart's spine. */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

/**
 * A smoothed line, using a cubic through the midpoints.
 *
 * Deliberately monotone-ish rather than a Catmull-Rom: a spline through
 * business figures can overshoot below zero between two small values, drawing a
 * dip that never happened. Anchoring the control points horizontally keeps the
 * curve inside the range of the data it joins.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length < 3) return linePath(points);
  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C${cx.toFixed(2)} ${prev.y.toFixed(2)}, ${cx.toFixed(2)} ${curr.y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }
  return d;
}

/** The same shape closed down to the baseline — the area chart's fill. */
export function areaPath(points: readonly Point[], height: number, smooth = true): string {
  if (points.length === 0) return '';
  const top = smooth ? smoothPath(points) : linePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${top} L${last.x.toFixed(2)} ${height} L${first.x.toFixed(2)} ${height} Z`;
}

export interface DonutArc {
  /** Length of the drawn portion, for `stroke-dasharray`. */
  length: number;
  /** Negative offset that rotates this arc after the ones before it. */
  offset: number;
  /** Share of the whole, 0–1 — for the legend's percentage. */
  fraction: number;
}

/**
 * Consecutive arcs around a circle, as `stroke-dasharray` lengths.
 *
 * Drawn with a dash on a stroked circle rather than as wedge paths: a stroke
 * gives the ring its thickness for free and cannot produce the hairline seams
 * that abutting filled wedges do at their shared edges.
 *
 * A total of zero yields no arcs at all, so an empty chart is an empty ring
 * rather than a full circle of the first colour — which would read as "100% of
 * this one thing" when the truth is "nothing yet".
 */
export function donutArcs(values: readonly number[], circumference: number): DonutArc[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total <= 0) return clean.map(() => ({ length: 0, offset: 0, fraction: 0 }));

  let consumed = 0;
  return clean.map((v) => {
    const fraction = v / total;
    const length = fraction * circumference;
    const arc = { length, offset: -consumed, fraction };
    consumed += length;
    return arc;
  });
}

/**
 * Running totals for a stacked chart: each series' top is itself plus
 * everything drawn beneath it.
 *
 * Returned as TOPS rather than as raw values so a caller can plot each band
 * directly; the band between `tops[i-1]` and `tops[i]` is series `i`. Computing
 * this in the component is where stacking usually goes wrong — a band drawn
 * from zero instead of from the layer below looks plausible and overstates
 * every series but the first.
 */
export function stackSeries(series: readonly (readonly number[])[]): number[][] {
  if (series.length === 0) return [];
  const length = Math.max(...series.map((s) => s.length));
  const tops: number[][] = [];
  const running = new Array<number>(length).fill(0);

  for (const s of series) {
    const row: number[] = [];
    for (let i = 0; i < length; i++) {
      const v = Number.isFinite(s[i]) ? Math.max(0, s[i]) : 0;
      running[i] += v;
      row.push(running[i]);
    }
    tops.push(row);
  }
  return tops;
}

export interface FunnelBand {
  /** Width of this band's top edge, 0–1 of the full width. */
  top: number;
  /** Width of its bottom edge — the next band's top. */
  bottom: number;
  fraction: number;
}

/**
 * A funnel's bands, each tapering toward the next.
 *
 * Width is the band's share of the LARGEST band rather than of the total, so a
 * funnel whose stages are 2, 2, 0, 0 still shows two full-width bands instead
 * of four quarter-width ones. The taper is between neighbours, which is what
 * makes it read as a pipeline rather than as a stack of unrelated bars.
 *
 * A minimum width keeps an empty stage visible: a band of literally zero width
 * disappears, and "nothing in this stage" is information worth seeing.
 */
export function funnelWidths(values: readonly number[], minWidth = 0.08): FunnelBand[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const max = Math.max(0, ...clean);
  const width = (v: number): number => (max <= 0 ? minWidth : Math.max(minWidth, v / max));

  return clean.map((v, i) => ({
    top: width(v),
    // The last band keeps its own width rather than tapering to nothing.
    bottom: i === clean.length - 1 ? width(v) : width(clean[i + 1]),
    fraction: max <= 0 ? 0 : v / max,
  }));
}
