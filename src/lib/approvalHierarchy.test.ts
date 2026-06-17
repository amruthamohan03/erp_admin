import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  approvalStageSchema,
  approvalStagesSchema,
  parseStages,
  nextApprovalStages,
  canApproveAtLevel,
  maxApprovalLevel,
  type ApprovalStage,
} from './approvalHierarchy';

// loadApprovalHierarchy hits the DB and stays for integration once a test
// DB harness lands. The pure stages_json logic is independently testable.

const HIERARCHY: ApprovalStage[] = [
  { role_id: 5, level: 1, label: 'Department Head' },
  { role_id: 12, level: 2, label: 'Finance Manager' },
  { role_id: 30, level: 3, label: 'CEO' },
];

describe('parseStages / Zod schemas', () => {
  it('accepts a valid stages array', () => {
    expect(() => parseStages(HIERARCHY)).not.toThrow();
  });

  it('rejects empty stages array', () => {
    expect(() => parseStages([])).toThrow(ZodError);
  });

  it('rejects a stage missing role_id', () => {
    expect(() =>
      parseStages([{ level: 1, label: 'X' }]),
    ).toThrow(ZodError);
  });

  it('rejects a stage with level=0 (1-based per the schema comment)', () => {
    expect(() =>
      approvalStageSchema.parse({ role_id: 5, level: 0, label: 'X' }),
    ).toThrow(ZodError);
  });

  it('approvalStagesSchema rejects non-array', () => {
    expect(() => approvalStagesSchema.parse('not an array')).toThrow(ZodError);
  });
});

describe('nextApprovalStages', () => {
  it('returns the stages at currentLevel + 1', () => {
    expect(nextApprovalStages(HIERARCHY, 0)).toEqual([HIERARCHY[0]]);
    expect(nextApprovalStages(HIERARCHY, 1)).toEqual([HIERARCHY[1]]);
    expect(nextApprovalStages(HIERARCHY, 2)).toEqual([HIERARCHY[2]]);
  });

  it('returns [] when the chain is exhausted', () => {
    expect(nextApprovalStages(HIERARCHY, 3)).toEqual([]);
    expect(nextApprovalStages(HIERARCHY, 99)).toEqual([]);
  });

  it('supports any-of approval at the same level', () => {
    const split: ApprovalStage[] = [
      { role_id: 5, level: 1, label: 'Dept A' },
      { role_id: 6, level: 1, label: 'Dept B' },
      { role_id: 12, level: 2, label: 'Finance' },
    ];
    expect(nextApprovalStages(split, 0)).toEqual([split[0], split[1]]);
  });
});

describe('canApproveAtLevel', () => {
  it('grants when the role matches a next-level stage', () => {
    expect(canApproveAtLevel(HIERARCHY, 5, 0)).toBe(true);
    expect(canApproveAtLevel(HIERARCHY, 12, 1)).toBe(true);
    expect(canApproveAtLevel(HIERARCHY, 30, 2)).toBe(true);
  });

  it('denies when the role is at the wrong level', () => {
    expect(canApproveAtLevel(HIERARCHY, 12, 0)).toBe(false); // finance can't do dept-head's job
    expect(canApproveAtLevel(HIERARCHY, 5, 1)).toBe(false);  // dept head can't do finance's
  });

  it('denies when no more approvals are possible', () => {
    expect(canApproveAtLevel(HIERARCHY, 30, 3)).toBe(false); // already fully approved
  });

  it('denies unknown roles', () => {
    expect(canApproveAtLevel(HIERARCHY, 999, 0)).toBe(false);
  });
});

describe('maxApprovalLevel', () => {
  it('returns the highest level in the chain', () => {
    expect(maxApprovalLevel(HIERARCHY)).toBe(3);
  });

  it('returns 0 for an empty stage list (legal at the function boundary)', () => {
    expect(maxApprovalLevel([])).toBe(0);
  });
});
