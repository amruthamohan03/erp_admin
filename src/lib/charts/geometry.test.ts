import { describe, it, expect } from 'vitest';
import { areaPath, donutArcs, linePath, niceMax, plotPoints, smoothPath } from './geometry';

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
