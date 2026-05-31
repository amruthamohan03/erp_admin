import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseActions,
  collectFieldUpdates,
  sideEffectDescriptors,
  type Action,
} from './actions';
import { buildRuleContext } from './index';

describe('parseActions', () => {
  it('returns [] for null / undefined', () => {
    expect(parseActions(null)).toEqual([]);
    expect(parseActions(undefined)).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(parseActions([])).toEqual([]);
  });

  it('parses a valid set_field action', () => {
    const actions = parseActions([
      { type: 'set_field', field: 'approved_by', value: { var: 'actor.userId' } },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('set_field');
  });

  it('parses a valid notify action', () => {
    const actions = parseActions([
      {
        type: 'notify',
        channel: 'email',
        to: { var: 'entity.email' },
        template: 'license_approved',
      },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('notify');
  });

  it('parses a mixed array preserving order', () => {
    const actions = parseActions([
      { type: 'set_field', field: 'a', value: 1 },
      { type: 'notify', channel: 'in_app', to: 1, template: 't' },
      { type: 'set_field', field: 'b', value: 2 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(['set_field', 'notify', 'set_field']);
  });

  it('rejects unknown action types', () => {
    expect(() => parseActions([{ type: 'unknown', x: 1 }])).toThrow(ZodError);
  });

  it('rejects set_field without a field name', () => {
    expect(() =>
      parseActions([{ type: 'set_field', value: 1 }]),
    ).toThrow(ZodError);
  });

  it('rejects notify with an unsupported channel', () => {
    expect(() =>
      parseActions([
        { type: 'notify', channel: 'carrier-pigeon', to: 1, template: 't' },
      ]),
    ).toThrow(ZodError);
  });
});

describe('collectFieldUpdates', () => {
  const ruleContext = buildRuleContext({
    entity: { id: 7, amount: 1000 },
    actorUserId: 42,
    payload: { note: 'looks good' },
  });

  it('writes literal values straight through', () => {
    const actions: Action[] = [
      { type: 'set_field', field: 'state_count', value: 1 },
    ];
    expect(collectFieldUpdates(actions, ruleContext)).toEqual({ state_count: 1 });
  });

  it('resolves JSON Logic vars against the rule context', () => {
    const actions: Action[] = [
      { type: 'set_field', field: 'approved_by', value: { var: 'actor.userId' } },
      { type: 'set_field', field: 'note', value: { var: 'payload.note' } },
    ];
    expect(collectFieldUpdates(actions, ruleContext)).toEqual({
      approved_by: 42,
      note: 'looks good',
    });
  });

  it('resolves computed JSON Logic expressions', () => {
    const actions: Action[] = [
      {
        type: 'set_field',
        field: 'tax_amount',
        value: { '*': [{ var: 'entity.amount' }, 0.18] },
      },
    ];
    expect(collectFieldUpdates(actions, ruleContext)).toEqual({ tax_amount: 180 });
  });

  it('ignores non-set_field actions', () => {
    const actions: Action[] = [
      { type: 'notify', channel: 'email', to: 1, template: 't' },
    ];
    expect(collectFieldUpdates(actions, ruleContext)).toEqual({});
  });

  it('later set_field on the same field wins (last-write-wins)', () => {
    const actions: Action[] = [
      { type: 'set_field', field: 'state_count', value: 1 },
      { type: 'set_field', field: 'state_count', value: 2 },
    ];
    expect(collectFieldUpdates(actions, ruleContext)).toEqual({ state_count: 2 });
  });
});

describe('sideEffectDescriptors', () => {
  const ruleContext = buildRuleContext({
    entity: { email: 'client@example.com' },
    actorUserId: 1,
  });

  it('resolves notify.to via applyRule and emits one descriptor per notify', () => {
    const actions: Action[] = [
      {
        type: 'notify',
        channel: 'email',
        to: { var: 'entity.email' },
        template: 'license_approved',
      },
    ];
    expect(sideEffectDescriptors(actions, ruleContext)).toEqual([
      {
        type: 'notify',
        channel: 'email',
        to: 'client@example.com',
        template: 'license_approved',
      },
    ]);
  });

  it('skips set_field actions (they are not side effects)', () => {
    const actions: Action[] = [
      { type: 'set_field', field: 'x', value: 1 },
    ];
    expect(sideEffectDescriptors(actions, ruleContext)).toEqual([]);
  });
});
