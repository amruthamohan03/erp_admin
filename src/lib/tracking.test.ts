import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseCompletedMilestones,
  validateMilestoneAdvance,
  completedMilestoneSchema,
} from './tracking';
import { BadRequestError, ConflictError } from '@/lib/errors';
import type { TrackingMilestone } from '@/lib/trackingTemplates';

// advanceTrackingMilestone is DB-bound and stays an integration target —
// these tests cover the pure rule logic the route + UI both depend on.

const IMPORT: TrackingMilestone[] = [
  { key: 'arrival',     label: 'Goods arrived at port',     order: 10 },
  { key: 'declaration', label: 'Customs declaration filed', order: 20 },
  { key: 'duties_paid', label: 'Duties paid',               order: 30 },
  { key: 'released',    label: 'Goods released',            order: 40 },
];

describe('validateMilestoneAdvance', () => {
  it('accepts the first milestone when nothing is current yet', () => {
    expect(validateMilestoneAdvance(IMPORT, null, 'arrival')).toEqual(IMPORT[0]);
  });

  it('accepts any in-template milestone when nothing is current (skipping forward is fine)', () => {
    expect(validateMilestoneAdvance(IMPORT, null, 'duties_paid')).toEqual(IMPORT[2]);
  });

  it('accepts the immediate next milestone', () => {
    expect(validateMilestoneAdvance(IMPORT, 'arrival', 'declaration')).toEqual(IMPORT[1]);
  });

  it('accepts skipping forward over intermediate milestones', () => {
    expect(validateMilestoneAdvance(IMPORT, 'arrival', 'released')).toEqual(IMPORT[3]);
  });

  it('rejects the same milestone as current (re-completing not allowed)', () => {
    expect(() =>
      validateMilestoneAdvance(IMPORT, 'declaration', 'declaration'),
    ).toThrow(ConflictError);
  });

  it('rejects going backward', () => {
    expect(() =>
      validateMilestoneAdvance(IMPORT, 'duties_paid', 'arrival'),
    ).toThrow(ConflictError);
  });

  it('rejects an unknown target milestone', () => {
    expect(() =>
      validateMilestoneAdvance(IMPORT, 'arrival', 'mystery'),
    ).toThrow(BadRequestError);
  });

  it('rejects an unknown current milestone (template renamed underneath the row)', () => {
    expect(() =>
      validateMilestoneAdvance(IMPORT, 'legacy_key', 'declaration'),
    ).toThrow(BadRequestError);
  });
});

describe('parseCompletedMilestones', () => {
  it('returns [] for null', () => {
    expect(parseCompletedMilestones(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseCompletedMilestones(undefined)).toEqual([]);
  });

  it('parses a well-formed array', () => {
    const blob = [
      { key: 'arrival', completedAt: '2026-06-18T10:00:00Z', completedBy: 1 },
      { key: 'declaration', completedAt: '2026-06-18T11:00:00Z', completedBy: 2 },
    ];
    expect(parseCompletedMilestones(blob)).toEqual(blob);
  });

  it('throws on a malformed entry (missing completedBy)', () => {
    expect(() =>
      parseCompletedMilestones([
        { key: 'arrival', completedAt: '2026-06-18T10:00:00Z' },
      ]),
    ).toThrow(ZodError);
  });

  it('throws on a non-array', () => {
    expect(() => parseCompletedMilestones({ key: 'arrival' })).toThrow(ZodError);
  });
});

describe('completedMilestoneSchema', () => {
  it('rejects an empty key', () => {
    expect(() =>
      completedMilestoneSchema.parse({
        key: '',
        completedAt: '2026-06-18T10:00:00Z',
        completedBy: 1,
      }),
    ).toThrow(ZodError);
  });

  it('rejects a non-integer completedBy', () => {
    expect(() =>
      completedMilestoneSchema.parse({
        key: 'arrival',
        completedAt: '2026-06-18T10:00:00Z',
        completedBy: 1.5,
      }),
    ).toThrow(ZodError);
  });
});
