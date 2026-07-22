// §4.5/§4.12 — config-driven conditional logic for transactional-page fields.
//
// This module is the SINGLE source of truth for evaluating the `conditions`
// JSONB on master_page_accordion_field_t. It is deliberately isomorphic (no DOM,
// no fetch, no Node APIs) so the SAME rules run on the client (to show/hide and
// constrain inputs) and on the server (to enforce them — §4.12 defense in depth).
//
// The business values that drive a form (e.g. which `kind_id`s are MCA) live in
// the seed-row JSON, never here. This file only knows how to evaluate predicates.

export type Scalar = string | number | boolean | null;

// A leaf predicate compares one field's current value against an operand.
// Exactly one operator key is expected; if several are present they are AND-ed.
export interface LeafPredicate {
  field: string;
  eq?: Scalar;
  neq?: Scalar;
  in?: Scalar[];
  nin?: Scalar[];
  gt?: number;
  lt?: number;
  truthy?: boolean;
  falsy?: boolean;
}

export type Predicate =
  | LeafPredicate
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export interface FieldBound {
  // Use another field's current value as the bound (e.g. expiry min = validation).
  field?: string;
  // Or a literal: the string 'today' resolves to the current date (YYYY-MM-DD).
  value?: 'today' | string | number;
}

export interface FieldConditions {
  visibleWhen?: Predicate;
  requiredWhen?: Predicate;
  readonlyWhen?: Predicate;
  min?: FieldBound;
  max?: FieldBound;
}

// Resolved per-field state for the current form values.
export interface FieldState {
  visible: boolean;
  required: boolean;
  readonly: boolean;
  min?: string | number;
  max?: string | number;
}

type Values = Record<string, unknown>;

// Normalize a value for comparison: numeric-looking strings/numbers collapse to a
// number so a select's "5" matches a DB integer 5; everything else stays as-is.
function norm(v: unknown): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v).trim();
  if (s === '') return null;
  // Only treat as a number when the whole string is numeric (avoid '2024-01' → NaN games).
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function equals(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

function inList(v: unknown, list: Scalar[]): boolean {
  return list.some((item) => equals(v, item));
}

function isFilled(v: unknown): boolean {
  const n = norm(v);
  return n !== null && n !== '';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function evalLeaf(leaf: LeafPredicate, values: Values): boolean {
  const v = values[leaf.field];
  // Each present operator must hold (AND). An empty leaf (just { field }) is true.
  if ('eq' in leaf && !equals(v, leaf.eq)) return false;
  if ('neq' in leaf && equals(v, leaf.neq)) return false;
  if ('in' in leaf && !inList(v, leaf.in ?? [])) return false;
  if ('nin' in leaf && inList(v, leaf.nin ?? [])) return false;
  if ('gt' in leaf && !(Number(norm(v)) > (leaf.gt as number))) return false;
  if ('lt' in leaf && !(Number(norm(v)) < (leaf.lt as number))) return false;
  if (leaf.truthy === true && !isFilled(v)) return false;
  if (leaf.falsy === true && isFilled(v)) return false;
  return true;
}

export function evaluatePredicate(pred: Predicate | undefined | null, values: Values): boolean {
  if (!pred) return true;
  if ('all' in pred) return pred.all.every((p) => evaluatePredicate(p, values));
  if ('any' in pred) return pred.any.some((p) => evaluatePredicate(p, values));
  if ('not' in pred) return !evaluatePredicate(pred.not, values);
  return evalLeaf(pred as LeafPredicate, values);
}

function resolveBound(bound: FieldBound | undefined, values: Values): string | number | undefined {
  if (!bound) return undefined;
  if (bound.field) {
    const v = values[bound.field];
    if (!isFilled(v)) return undefined;
    // Dates come back as ISO strings / Date — keep just the calendar part so a
    // <input type="date"> min/max compares cleanly.
    return String(v).slice(0, 10);
  }
  if (bound.value === 'today') return today();
  return bound.value;
}

// Parse the raw JSONB column into a typed FieldConditions (or null).
export function parseConditions(raw: unknown): FieldConditions | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as FieldConditions;
}

/**
 * Resolve a field's effective state for the given form values.
 *
 * `staticRequired` is the field's plain `required` flag; `requiredWhen` (when
 * present) overrides it. A field that isn't visible is never required (so the
 * server won't enforce it and the client won't block save on it).
 */
export function resolveFieldState(
  conditions: FieldConditions | null,
  staticRequired: boolean,
  values: Values,
): FieldState {
  if (!conditions) {
    return { visible: true, required: staticRequired, readonly: false };
  }
  const visible = evaluatePredicate(conditions.visibleWhen, values);
  const required =
    conditions.requiredWhen !== undefined
      ? evaluatePredicate(conditions.requiredWhen, values)
      : staticRequired;
  const readonly = conditions.readonlyWhen
    ? evaluatePredicate(conditions.readonlyWhen, values)
    : false;
  return {
    visible,
    required: visible && required,
    readonly,
    min: resolveBound(conditions.min, values),
    max: resolveBound(conditions.max, values),
  };
}

/**
 * Server-side bound check for a single field's submitted value. Returns an error
 * string (for the API envelope) or null when the value satisfies min/max.
 */
export function checkBounds(state: FieldState, label: string, value: unknown): string | null {
  if (!isFilled(value)) return null;
  const v = String(value).slice(0, 10);
  if (state.min !== undefined && v < String(state.min)) {
    return `${label} must be on or after ${state.min}`;
  }
  if (state.max !== undefined && v > String(state.max)) {
    return `${label} must be on or before ${state.max}`;
  }
  return null;
}
