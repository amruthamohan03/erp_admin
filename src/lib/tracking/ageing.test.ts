import { describe, it, expect } from 'vitest';
import { AGEING_BUCKETS, ageingBucket, daysBetween } from './ageing';

describe('AGEING_BUCKETS', () => {
  it('is disjoint and leaves no gap between bands', () => {
    for (let i = 1; i < AGEING_BUCKETS.length; i++) {
      const prev = AGEING_BUCKETS[i - 1];
      expect(prev.max).not.toBeNull();
      expect(AGEING_BUCKETS[i].min).toBe((prev.max as number) + 1);
    }
  });

  it('starts at zero and ends open, so every age lands somewhere', () => {
    expect(AGEING_BUCKETS[0].min).toBe(0);
    expect(AGEING_BUCKETS[AGEING_BUCKETS.length - 1].max).toBeNull();
  });
});

describe('ageingBucket', () => {
  it('places an age in its band', () => {
    expect(ageingBucket(0).key).toBe('0_7');
    expect(ageingBucket(7).key).toBe('0_7');
    expect(ageingBucket(8).key).toBe('8_30');
    expect(ageingBucket(30).key).toBe('8_30');
    expect(ageingBucket(61).key).toBe('61_90');
    expect(ageingBucket(90).key).toBe('61_90');
  });

  it('puts anything past the last bound in the open-ended band', () => {
    expect(ageingBucket(91).key).toBe('over_90');
    expect(ageingBucket(5000).key).toBe('over_90');
  });

  // An anchor date in the future is a typo, not a file that is minus-four days
  // old. It must still appear somewhere rather than vanish from the chart.
  it('treats a negative age as the youngest band', () => {
    expect(ageingBucket(-4).key).toBe('0_7');
  });

  it('ignores a fractional age rather than falling between bands', () => {
    expect(ageingBucket(7.9).key).toBe('0_7');
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 8))).toBe(7);
  });

  it('ignores the clock, so two dates a minute apart are the same day', () => {
    expect(daysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(1);
  });

  it('is negative when the anchor is in the future', () => {
    expect(daysBetween(new Date(2026, 0, 10), new Date(2026, 0, 1))).toBe(-9);
  });
});
