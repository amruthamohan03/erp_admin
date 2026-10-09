import { describe, it, expect } from 'vitest';
import {
  areaPath,
  axisLabel,
  axisTicks,
  donutArcs,
  funnelWidths,
  linePath,
  niceMax,
  plotPoints,
  smoothPath,
  stackSeries,
} from './geometry';

describe('niceMax', () => {
  it('rounds up to a number a human would label an axis with', () => {
    expect(niceMax([7])).toBe(10);
    expect(niceMax([12])).toBe(20);
    expect(niceMax([35])).toBe(50);
    expect(niceMax([120])).toBe(200);
  });

  // The failure this guards: dividing by zero puts NaN in the path, SVG drops
  // it, and the card renders blank with nothing to say it is broken.
  it('is never zero, whatever the series', () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0, 0])).toBe(1);
    expect(niceMax([-5])).toBe(1);
  });

  it('ignores values that are not finite', () => {
    expect(niceMax([NaN, Infinity, 4])).toBe(5);
  });
});

describe('plotPoints', () => {
  // SVG's y grows DOWNWARD, so zero belongs at the bottom. Getting this
  // backwards draws a plausible-looking chart that is upside down.
  it('puts the largest value at the top and zero on the floor', () => {
    const pts = plotPoints([0, 10], 100, 50, 10);
    expect(pts[0].y).toBe(50);
    expect(pts[1].y).toBe(0);
  });

  it('spreads points evenly across the full width', () => {
    const pts = plotPoints([1, 2, 3], 100, 50);
    expect(pts.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it('places a single point mid-plot rather than at an undefined x', () => {
    const [p] = plotPoints([5], 100, 50);
    expect(p.x).toBe(50);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('never produces NaN for an all-zero series', () => {
    for (const p of plotPoints([0, 0, 0], 100, 50)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('returns nothing for an empty series', () => {
    expect(plotPoints([], 100, 50)).toEqual([]);
  });

  // A value above the scale would otherwise draw outside the card.
  it('clamps a negative value to the baseline', () => {
    const [p] = plotPoints([-4], 100, 50, 10);
    expect(p.y).toBe(50);
  });
});

describe('paths', () => {
  it('starts with a move and then draws', () => {
    expect(linePath(plotPoints([1, 2], 100, 50))).toMatch(/^M0\.00 /);
    expect(linePath(plotPoints([1, 2], 100, 50))).toContain('L');
  });

  it('is empty for no points rather than a stray M', () => {
    expect(linePath([])).toBe('');
    expect(areaPath([], 50)).toBe('');
  });

  it('smooths with cubics once there are enough points', () => {
    expect(smoothPath(plotPoints([1, 5, 2, 8], 100, 50))).toContain('C');
  });

  it('falls back to straight segments below three points', () => {
    expect(smoothPath(plotPoints([1, 5], 100, 50))).not.toContain('C');
  });

  it('closes the area down to the baseline', () => {
    const d = areaPath(plotPoints([1, 5, 2], 120, 60), 60);
    expect(d.trimEnd().endsWith('Z')).toBe(true);
    expect(d).toContain(' 60');
  });
});

describe('donutArcs', () => {
  it('splits the circle in proportion', () => {
    const arcs = donutArcs([1, 3], 100);
    expect(arcs[0].length).toBeCloseTo(25);
    expect(arcs[1].length).toBeCloseTo(75);
    expect(arcs[0].fraction).toBeCloseTo(0.25);
  });

  it('offsets each arc past the ones before it', () => {
    const arcs = donutArcs([1, 1, 2], 100);
    expect(arcs[0].offset).toBeCloseTo(-0);
    expect(arcs[1].offset).toBeCloseTo(-25);
    expect(arcs[2].offset).toBeCloseTo(-50);
  });

  it('never exceeds the circumference', () => {
    const total = donutArcs([3, 7, 11], 360).reduce((s, a) => s + a.length, 0);
    expect(total).toBeCloseTo(360);
  });

  // "Nothing yet" must not render as a full ring of the first colour, which
  // would read as 100% of that one category.
  it('draws nothing when every value is zero', () => {
    for (const a of donutArcs([0, 0], 100)) expect(a.length).toBe(0);
  });

  it('ignores negatives rather than drawing backwards', () => {
    const arcs = donutArcs([-5, 5], 100);
    expect(arcs[0].length).toBe(0);
    expect(arcs[1].length).toBeCloseTo(100);
  });
});

describe('stackSeries', () => {
  it('returns running tops, not raw values', () => {
    expect(stackSeries([[1, 2], [3, 4]])).toEqual([
      [1, 2],
      [4, 6],
    ]);
  });

  // The classic stacking bug: a band drawn from zero rather than from the layer
  // below. It looks plausible and overstates every series but the first.
  it('never draws a later band from the baseline', () => {
    const [first, second] = stackSeries([[5], [5]]);
    expect(first[0]).toBe(5);
    expect(second[0]).toBe(10);
  });

  it('treats a short series as zero rather than shifting it', () => {
    expect(stackSeries([[1, 1, 1], [2]])).toEqual([
      [1, 1, 1],
      [3, 1, 1],
    ]);
  });

  it('ignores negatives and non-finite values', () => {
    expect(stackSeries([[-4, NaN, 2]])).toEqual([[0, 0, 2]]);
  });

  it('is empty for no series', () => {
    expect(stackSeries([])).toEqual([]);
  });
});

describe('funnelWidths', () => {
  it('scales each band against the LARGEST, not the total', () => {
    const bands = funnelWidths([10, 5]);
    expect(bands[0].top).toBeCloseTo(1);
    expect(bands[1].top).toBeCloseTo(0.5);
  });

  it('tapers each band toward the next', () => {
    const bands = funnelWidths([10, 5, 1]);
    expect(bands[0].bottom).toBeCloseTo(bands[1].top);
    expect(bands[1].bottom).toBeCloseTo(bands[2].top);
  });

  it('leaves the last band untapered', () => {
    const bands = funnelWidths([10, 4]);
    expect(bands[1].bottom).toBeCloseTo(bands[1].top);
  });

  // An invisible band is indistinguishable from a missing stage.
  it('keeps an empty stage visible at the minimum width', () => {
    const bands = funnelWidths([10, 0]);
    expect(bands[1].top).toBeGreaterThan(0);
    expect(bands[1].fraction).toBe(0);
  });

  it('does not divide by zero when every stage is empty', () => {
    for (const b of funnelWidths([0, 0])) {
      expect(Number.isFinite(b.top)).toBe(true);
      expect(b.fraction).toBe(0);
    }
  });
});

describe('axisTicks', () => {
  // The bug this exists for: niceMax returns 5 for a series peaking at 4, and a
  // fixed four divisions gave 5 / 3.75 / 2.5 / 1.25 / 0. The axis rounded those
  // and printed "5, 4, 3, 1, 0" — unevenly spaced, skipping 2, simply wrong.
  it('splits a bound of 5 into whole numbers rather than quarters', () => {
    expect(axisTicks(5)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('covers every bound niceMax can produce with whole-number steps', () => {
    for (const max of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      const ticks = axisTicks(max);
      expect(ticks[0]).toBe(max);
      expect(ticks[ticks.length - 1]).toBe(0);
      for (const t of ticks) {
        // Half-steps are tolerated only where nothing else divides (max = 1).
        expect(Number.isInteger(t * 2)).toBe(true);
      }
    }
  });

  it('keeps the ticks evenly spaced and descending', () => {
    const ticks = axisTicks(20);
    const step = ticks[0] - ticks[1];
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i - 1] - ticks[i]).toBeCloseTo(step, 10);
    }
  });

  it('prefers the requested division count when it divides cleanly', () => {
    expect(axisTicks(20, 4)).toEqual([20, 15, 10, 5, 0]);
    expect(axisTicks(100, 4)).toEqual([100, 75, 50, 25, 0]);
  });

  it('never produces a duplicate label, which is what made the axis unreadable', () => {
    for (const max of [1, 2, 3, 4, 5, 7, 10, 20, 50]) {
      const labels = axisTicks(max).map(axisLabel);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('axisLabel', () => {
  it('prints a whole number plainly and a fraction to one decimal', () => {
    expect(axisLabel(5)).toBe('5');
    expect(axisLabel(0)).toBe('0');
    expect(axisLabel(0.5)).toBe('0.5');
  });
});
