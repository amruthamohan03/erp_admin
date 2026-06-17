import { describe, it, expect } from 'vitest';
import { buildRuleContext, type TransitionContext } from './index';
import { applyRule } from '@/engine/rules';

// executeTransition + loadWorkflow hit the DB and stay for integration once
// a test-DB harness lands. Until then, buildRuleContext + applyRule cover the
// rule-gate logic end-to-end at the wire boundary the master config will see.

const FIXED_NOW = '2026-06-01T12:00:00.000Z';

const baseCtx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  entity: { id: 1 },
  actorUserId: 1,
  actorRoleId: 1,
  ...over,
});

describe('buildRuleContext', () => {
  it('exposes entity / actor / payload / now to JSON Logic vars', () => {
    const tx: TransitionContext = {
      entity: { id: 7, status: 'draft', amount: 1500 },
      actorUserId: 42,
      actorRoleId: 5,
      payload: { reason: 'manual override' },
    };
    const ctx = buildRuleContext(tx, FIXED_NOW);
    expect(ctx).toEqual({
      entity: { id: 7, status: 'draft', amount: 1500 },
      actor: { userId: 42, roleId: 5 },
      payload: { reason: 'manual override' },
      now: FIXED_NOW,
    });
  });

  it('defaults payload to {} when not provided', () => {
    const ctx = buildRuleContext(baseCtx({ entity: { id: 1 } }), FIXED_NOW);
    expect(ctx.payload).toEqual({});
  });

  it('defaults now to current ISO timestamp when not overridden', () => {
    const before = Date.now();
    const ctx = buildRuleContext(baseCtx());
    const after = Date.now();
    expect(typeof ctx.now).toBe('string');
    const nowMs = new Date(ctx.now as string).getTime();
    expect(nowMs).toBeGreaterThanOrEqual(before);
    expect(nowMs).toBeLessThanOrEqual(after);
  });

  it('exposes now as a JSON Logic var (action_json can read it)', () => {
    const ctx = buildRuleContext(baseCtx(), FIXED_NOW);
    expect(applyRule({ var: 'now' }, ctx)).toBe(FIXED_NOW);
  });

  it('exposes actor.roleId for canApproveAtLevel rule lookups', () => {
    const ctx = buildRuleContext(
      baseCtx({ actorUserId: 42, actorRoleId: 12 }),
      FIXED_NOW,
    );
    expect(applyRule({ var: 'actor.roleId' }, ctx)).toBe(12);
    expect(applyRule({ var: 'actor.userId' }, ctx)).toBe(42);
  });
});

describe('workflow gate — applyRule over a TransitionContext', () => {
  // Mirrors what executeTransition does after loading the gate rule.
  function isAllowed(ruleJson: unknown, tx: TransitionContext): boolean {
    return Boolean(applyRule(ruleJson, buildRuleContext(tx)));
  }

  const draft1500: TransitionContext = baseCtx({
    entity: { status: 'draft', amount: 1500 },
  });
  const draft500: TransitionContext = baseCtx({
    entity: { status: 'draft', amount: 500 },
  });
  const approved1500: TransitionContext = baseCtx({
    entity: { status: 'approved', amount: 1500 },
  });

  it('allows when amount > 1000 and status is draft', () => {
    const rule = {
      and: [
        { '==': [{ var: 'entity.status' }, 'draft'] },
        { '>': [{ var: 'entity.amount' }, 1000] },
      ],
    };
    expect(isAllowed(rule, draft1500)).toBe(true);
    expect(isAllowed(rule, draft500)).toBe(false);
    expect(isAllowed(rule, approved1500)).toBe(false);
  });

  it('reads from payload for runtime arguments (reason required)', () => {
    const rule = {
      '!!': [{ var: 'payload.reason' }],
    };
    expect(
      isAllowed(rule, baseCtx({ entity: {}, payload: { reason: 'ok' } })),
    ).toBe(true);
    expect(isAllowed(rule, baseCtx({ entity: {}, payload: {} }))).toBe(false);
    expect(isAllowed(rule, baseCtx({ entity: {} }))).toBe(false);
  });

  it('reads from actor.userId for caller-identity rules (no self-approve)', () => {
    const rule = {
      '!=': [{ var: 'actor.userId' }, { var: 'entity.created_by' }],
    };
    expect(
      isAllowed(
        rule,
        baseCtx({ entity: { created_by: 42 }, actorUserId: 99 }),
      ),
    ).toBe(true);
    expect(
      isAllowed(
        rule,
        baseCtx({ entity: { created_by: 42 }, actorUserId: 42 }),
      ),
    ).toBe(false);
  });
});
