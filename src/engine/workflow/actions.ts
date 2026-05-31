import { z } from 'zod';
import { applyRule } from '@/engine/rules';

// Action format for workflow_transition_master_t.action_json per CLAUDE.md §4.6.
//
// Each transition row carries an ordered array of typed actions. Two action
// types are currently supported:
//
//   set_field — patches a field on the entity in the same UPDATE that writes
//     the new state. `value` is a JSON Logic expression evaluated against the
//     rule context (entity / actor / payload) — so referencing the caller is
//     `{ "var": "actor.userId" }`, a literal is `123`, etc.
//
//   notify — declarative recipient + template. The engine doesn't send mail
//     itself (sending sits inside the caller's transaction); executeTransition
//     returns the descriptor in `sideEffects` and the caller is responsible
//     for dispatching after the DB write commits.
//
// Add new action types by extending the discriminated union below and the
// runtime switch in collectFieldUpdates / sideEffectDescriptors.

const setFieldActionSchema = z.object({
  type: z.literal('set_field'),
  field: z.string().min(1).max(100),
  // JSON Logic expression OR a literal value. We validate the value side
  // permissively because json-logic-js accepts both — schema validation
  // catches malformed actions but not malformed JSON Logic.
  value: z.unknown(),
});

const notifyActionSchema = z.object({
  type: z.literal('notify'),
  channel: z.enum(['email', 'sms', 'in_app']),
  // JSON Logic expression resolving to a recipient address / user-id / etc.
  to: z.unknown(),
  template: z.string().min(1).max(100),
});

const actionSchema = z.discriminatedUnion('type', [
  setFieldActionSchema,
  notifyActionSchema,
]);

export const actionsSchema = z.array(actionSchema);

export type SetFieldAction = z.infer<typeof setFieldActionSchema>;
export type NotifyAction = z.infer<typeof notifyActionSchema>;
export type Action = z.infer<typeof actionSchema>;

// Parse an action_json blob from the DB. Treats null / undefined / empty
// strings as "no actions"; throws if the shape is malformed so a typo in a
// master row fails noisily rather than silently dropping side effects.
export function parseActions(actionJson: unknown): Action[] {
  if (actionJson == null) return [];
  if (Array.isArray(actionJson) && actionJson.length === 0) return [];
  return actionsSchema.parse(actionJson);
}

/**
 * Walk the actions, evaluate every `set_field` value against the rule
 * context, and produce a `{ field: value }` patch the caller can splice
 * into the entity's UPDATE statement.
 */
export function collectFieldUpdates(
  actions: Action[],
  ruleContext: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const action of actions) {
    if (action.type === 'set_field') {
      patch[action.field] = applyRule(action.value, ruleContext);
    }
  }
  return patch;
}

// Side-effect descriptors — actions whose execution isn't a DB write. The
// caller (case-runtime) decides what to do with these after the UPDATE
// commits: enqueue a job, write to an outbox table, fire-and-forget, etc.
export interface NotifyDescriptor {
  type: 'notify';
  channel: NotifyAction['channel'];
  to: unknown;
  template: string;
}

export type SideEffectDescriptor = NotifyDescriptor;

export function sideEffectDescriptors(
  actions: Action[],
  ruleContext: Record<string, unknown>,
): SideEffectDescriptor[] {
  const out: SideEffectDescriptor[] = [];
  for (const action of actions) {
    if (action.type === 'notify') {
      out.push({
        type: 'notify',
        channel: action.channel,
        to: applyRule(action.to, ruleContext),
        template: action.template,
      });
    }
  }
  return out;
}
