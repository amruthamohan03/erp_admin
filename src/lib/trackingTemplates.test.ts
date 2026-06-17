import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  trackingMilestoneSchema,
  trackingMilestonesSchema,
  parseMilestones,
  orderedMilestones,
  nextMilestone,
  trackingProgress,
  type TrackingMilestone,
} from './trackingTemplates';

// loadTrackingTemplate is DB-bound and stays an integration target.

const IMPORT_MILESTONES: TrackingMilestone[] = [
  { key: 'arrival',     label: 'Goods arrived at port',     order: 10 },
  { key: 'declaration', label: 'Customs declaration filed', order: 20 },
  { key: 'duties_paid', label: 'Duties paid',               order: 30 },
  { key: 'released',    label: 'Goods released',            order: 40 },
];

describe('parseMilestones / Zod schemas', () => {
  it('accepts a valid milestones array', () => {
    expect(() => parseMilestones(IMPORT_MILESTONES)).not.toThrow();
  });

  it('rejects an empty milestones array', () => {
    expect(() => parseMilestones([])).toThrow(ZodError);
  });

  it('rejects a milestone with missing fields', () => {
    expect(() =>
      parseMilestones([{ key: 'arrival', label: 'X' }]),
    ).toThrow(ZodError);
  });

  it('rejects a milestone with negative order', () => {
    expect(() =>
      trackingMilestoneSchema.parse({ key: 'k', label: 'L', order: -1 }),
    ).toThrow(ZodError);
  });

  it('trackingMilestonesSchema rejects a non-array', () => {
    expect(() => trackingMilestonesSchema.parse({ not: 'array' })).toThrow(ZodError);
  });
});

describe('orderedMilestones', () => {
  it('sorts by order ascending', () => {
    const shuffled: TrackingMilestone[] = [
      IMPORT_MILESTONES[3], // released (40)
      IMPORT_MILESTONES[0], // arrival (10)
      IMPORT_MILESTONES[2], // duties_paid (30)
      IMPORT_MILESTONES[1], // declaration (20)
    ];
    expect(orderedMilestones(shuffled)).toEqual(IMPORT_MILESTONES);
  });

  it('breaks ties on order by key (deterministic across loads)', () => {
    const tied: TrackingMilestone[] = [
      { key: 'b', label: 'B', order: 10 },
      { key: 'a', label: 'A', order: 10 },
    ];
    expect(orderedMilestones(tied).map((m) => m.key)).toEqual(['a', 'b']);
  });
});

describe('nextMilestone', () => {
  it('returns the milestone after the given key', () => {
    expect(nextMilestone(IMPORT_MILESTONES, 'arrival')).toEqual(
      IMPORT_MILESTONES[1],
    );
    expect(nextMilestone(IMPORT_MILESTONES, 'duties_paid')).toEqual(
      IMPORT_MILESTONES[3],
    );
  });

  it('returns undefined for the terminal milestone', () => {
    expect(nextMilestone(IMPORT_MILESTONES, 'released')).toBeUndefined();
  });

  it('returns undefined for unknown keys', () => {
    expect(nextMilestone(IMPORT_MILESTONES, 'nonsense')).toBeUndefined();
  });
});

describe('trackingProgress', () => {
  it('returns 0 for no completed milestones', () => {
    expect(trackingProgress(IMPORT_MILESTONES, [])).toBe(0);
  });

  it('returns 100 when every milestone is complete', () => {
    expect(
      trackingProgress(IMPORT_MILESTONES, [
        'arrival',
        'declaration',
        'duties_paid',
        'released',
      ]),
    ).toBe(100);
  });

  it('ignores unknown completed keys (forward-compatible with renames)', () => {
    expect(
      trackingProgress(IMPORT_MILESTONES, [
        'arrival',
        'declaration',
        'mystery_milestone',
      ]),
    ).toBe(50);
  });

  it('returns 0 for an empty template (defensive)', () => {
    expect(trackingProgress([], ['anything'])).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 1 of 3 = 33.33%, rounds to 33
    expect(
      trackingProgress(
        [
          { key: 'a', label: 'A', order: 1 },
          { key: 'b', label: 'B', order: 2 },
          { key: 'c', label: 'C', order: 3 },
        ],
        ['a'],
      ),
    ).toBe(33);
  });
});
