// §4.12 — turning a field's `conditions` into rules a person can read and build,
// and back.
//
// The runtime (conditions.ts) evaluates predicates; this module is only the
// editor's vocabulary for them: the four effects an operator can pick, the
// comparisons that make sense for each field type, and a plain-English sentence
// for any predicate — including ones written by a migration rather than this
// screen. Pure, so the Conditions tab and its tests share it.
import type { FieldConditions, LeafPredicate, Predicate, Scalar } from './conditions';

/** What a rule does to the fields it targets. */
export type RuleEffect = 'show' | 'hide' | 'require' | 'readonly';

export const RULE_EFFECTS: { value: RuleEffect; label: string; verb: string }[] = [
  { value: 'show', label: 'Show only when…', verb: 'Show' },
  { value: 'hide', label: 'Hide when…', verb: 'Hide' },
  { value: 'require', label: 'Make required when…', verb: 'Require' },
  { value: 'readonly', label: 'Make read-only when…', verb: 'Lock' },
];

/** Which `conditions` key an effect writes. Show and Hide share one. */
export const EFFECT_KEY: Record<RuleEffect, 'visibleWhen' | 'requiredWhen' | 'readonlyWhen'> = {
  show: 'visibleWhen',
  hide: 'visibleWhen',
  require: 'requiredWhen',
  readonly: 'readonlyWhen',
};

export type RuleOperator = 'eq' | 'neq' | 'in' | 'nin' | 'truthy' | 'falsy' | 'gt' | 'lt';

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is one of',
  nin: 'is none of',
  truthy: 'is filled in',
  falsy: 'is empty',
  gt: 'is more than',
  lt: 'is less than',
};

/** The comparisons that mean something for a field of this type. */
export function operatorsFor(fieldType: string): RuleOperator[] {
  if (fieldType === 'number' || fieldType === 'date') return ['eq', 'neq', 'gt', 'lt', 'truthy', 'falsy'];
  if (fieldType === 'select') return ['eq', 'neq', 'in', 'nin', 'truthy', 'falsy'];
  return ['eq', 'neq', 'truthy', 'falsy'];
}

/** Operators that compare against no value at all. */
export const operatorNeedsValue = (op: RuleOperator): boolean => op !== 'truthy' && op !== 'falsy';
/** Operators that take a list rather than one value. */
export const operatorTakesList = (op: RuleOperator): boolean => op === 'in' || op === 'nin';

/** A select stores ids; a number compares numerically. Keep the stored shape. */
function scalar(raw: string): Scalar {
  const t = raw.trim();
  return /^-?\d+(\.\d+)?$/u.test(t) ? Number(t) : t;
}

export function buildLeaf(field: string, op: RuleOperator, values: string[]): LeafPredicate {
  switch (op) {
    case 'truthy':
      return { field, truthy: true };
    case 'falsy':
      return { field, falsy: true };
    case 'in':
      return { field, in: values.map(scalar) };
    case 'nin':
      return { field, nin: values.map(scalar) };
    case 'gt':
      return { field, gt: Number(values[0]) };
    case 'lt':
      return { field, lt: Number(values[0]) };
    case 'neq':
      return { field, neq: scalar(values[0] ?? '') };
    default:
      return { field, eq: scalar(values[0] ?? '') };
  }
}

/** The predicate an effect stores: Hide is Show's negation on the same key. */
export function predicateForEffect(effect: RuleEffect, leaf: Predicate): Predicate {
  return effect === 'hide' ? { not: leaf } : leaf;
}

export interface DescribeContext {
  /** A field name as the operator knows it — its label. */
  labelOf: (field: string) => string;
  /** A stored value as the operator knows it — an option's label for a select. */
  valueOf: (field: string, value: Scalar) => string;
}

const list = (items: string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

/** A predicate as a sentence fragment: "Type of Goods is FUEL". */
export function describePredicate(p: Predicate, ctx: DescribeContext): string {
  if ('all' in p) return p.all.map((x) => describePredicate(x, ctx)).join(' and ');
  if ('any' in p) return p.any.map((x) => describePredicate(x, ctx)).join(' or ');
  if ('not' in p) return `not (${describePredicate(p.not, ctx)})`;

  const name = ctx.labelOf(p.field);
  const v = (x: Scalar): string => ctx.valueOf(p.field, x);
  const parts: string[] = [];
  if (p.eq !== undefined) parts.push(`${name} is ${v(p.eq)}`);
  if (p.neq !== undefined) parts.push(`${name} is not ${v(p.neq)}`);
  if (p.in) parts.push(`${name} is ${list(p.in.map(v))}`);
  if (p.nin) parts.push(`${name} is not ${list(p.nin.map(v))}`);
  if (p.gt !== undefined) parts.push(`${name} is more than ${p.gt}`);
  if (p.lt !== undefined) parts.push(`${name} is less than ${p.lt}`);
  if (p.truthy) parts.push(`${name} is filled in`);
  if (p.falsy) parts.push(`${name} is empty`);
  return parts.join(' and ') || name;
}

export interface FieldRule {
  key: 'visibleWhen' | 'requiredWhen' | 'readonlyWhen';
  effect: RuleEffect;
  /** Human-readable condition, without the effect. */
  when: string;
}

/**
 * The rules one field carries, for the list. A `visibleWhen` of the shape
 * `{ not: X }` is shown as "Hide when X" — how an operator thinks about it.
 */
export function rulesOf(conditions: FieldConditions | null | undefined, ctx: DescribeContext): FieldRule[] {
  if (!conditions) return [];
  const out: FieldRule[] = [];
  if (conditions.visibleWhen) {
    const v = conditions.visibleWhen;
    if ('not' in v) out.push({ key: 'visibleWhen', effect: 'hide', when: describePredicate(v.not, ctx) });
    else out.push({ key: 'visibleWhen', effect: 'show', when: describePredicate(v, ctx) });
  }
  if (conditions.requiredWhen) {
    out.push({ key: 'requiredWhen', effect: 'require', when: describePredicate(conditions.requiredWhen, ctx) });
  }
  if (conditions.readonlyWhen) {
    out.push({ key: 'readonlyWhen', effect: 'readonly', when: describePredicate(conditions.readonlyWhen, ctx) });
  }
  return out;
}

/** Every field name a predicate reads — for "no rule may depend on itself". */
export function fieldsOf(p: Predicate): string[] {
  if ('all' in p) return p.all.flatMap(fieldsOf);
  if ('any' in p) return p.any.flatMap(fieldsOf);
  if ('not' in p) return fieldsOf(p.not);
  return [p.field];
}
