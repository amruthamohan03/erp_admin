import { describe, expect, it } from 'vitest';
import { changeOf, formatChange, formatMetric } from './comparison';

describe('changeOf', () => {
  it('colours a rise by whether a rise is good news', () => {
    expect(changeOf(120, 100, 'up')).toEqual({ abs: 20, pct: 20, tone: 'good' });
    expect(changeOf(12, 10, 'down')).toEqual({ abs: 2, pct: 20, tone: 'bad' });
    expect(changeOf(12, 10, 'neutral')?.tone).toBe('neutral');
  });

  it('has no percentage against a zero base, and nothing without both values', () => {
    expect(changeOf(5, 0, 'up')).toEqual({ abs: 5, pct: null, tone: 'good' });
    expect(changeOf(null, 4, 'up')).toBeNull();
  });
});

describe('formatting', () => {
  it('writes each metric kind the way it is read', () => {
    expect(formatMetric(1234, 'count')).toBe('1,234');
    expect(formatMetric(1234.5, 'usd')).toBe('$1,234.50');
    expect(formatMetric(128500, 'kg')).toBe('128.5 t');
    expect(formatMetric(640, 'kg')).toBe('640 kg');
    expect(formatMetric(4.25, 'days')).toBe('4.3 d');
    expect(formatMetric(null, 'usd')).toBe('—');
  });

  it('signs the change and shows the percentage', () => {
    expect(formatChange(changeOf(80, 100, 'up'), 'count')).toBe('−20 (−20%)');
    expect(formatChange(changeOf(100, 100, 'up'), 'count')).toBe('no change');
    expect(formatChange(changeOf(3, 0, 'up'), 'count')).toBe('+3');
  });
});
