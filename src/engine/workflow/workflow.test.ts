import { describe, it, expect } from 'vitest';
import { buildRuleContext, type TransitionContext } from './index';
import { applyRule } from '@/engine/rules';

// executeTransition + loadWorkflow hit the DB and stay for integration once
// a test-DB harness lands. Until then, buildRuleContext + applyRule cover the
// rule-gate logic end-to-end at the wire boundary the master config will see.

describe('buildRuleContext', () => {
  it('exposes entity / actor / payload to JSON Logic vars', () => {
    const tx: TransitionContext = {
      entity: { id: 7, status: 'draft', amount: 1500 },
      actorUserId: 42,
      payload: { reason: 'manual override' },
    };
    const ctx = buildRuleContext(tx);
    expect(ctx).toEqual({
      entity: { id: 7, status: 'draft', amount: 1500 },
      actor: { userId: 42 },
      payload: { reason: 'manual override' },
    });
  });

  it('defaults payload to {} when not provided', () => {
    const ctx = buildRuleContext({
      entity: { id: 1 },
      actorUserId: 1,
    });
    expect(ctx.payload).toEqual({});
  });
});

describe('workflow gate — applyRule over a TransitionContext', () => {
  // Mirrors what executeTransition does after loading the gate rule.
  function isAllowed(
    ruleJson: unknown,
    tx: TransitionContext,
  ): boolean {
    return Boolean(applyRule(ruleJson, buildRuleContext(tx)));
  }

  const draft1500: TransitionContext = {
    entity: { status: 'draft', amount: 1500 },
    actorUserId: 1,
  };
  const draft500: TransitionContext = {
    entity: { status: 'draft', amount: 500 },
    actorUserId: 1,
  };
  const approved1500: TransitionContext = {
    entity: { status: 'approved', amount: 1500 },
    actorUserId: 1,
  };

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
      isAllowed(rule, { entity: {}, actorUserId: 1, payload: { reason: 'ok' } }),
    ).toBe(true);
    expect(isAllowed(rule, { entity: {}, actorUserId: 1, payload: {} })).toBe(false);
    expect(isAllowed(rule, { entity: {}, actorUserId: 1 })).toBe(false);
  });

  it('reads from actor.userId for caller-identity rules (no self-approve)', () => {
    const rule = {
      '!=': [{ var: 'actor.userId' }, { var: 'entity.created_by' }],
    };
    expect(
      isAllowed(rule, {
        entity: { created_by: 42 },
        actorUserId: 99,
      }),
    ).toBe(true);
    expect(
      isAllowed(rule, {
        entity: { created_by: 42 },
        actorUserId: 42,
      }),
    ).toBe(false);
  });
});
