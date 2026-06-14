// §4.5/§4.12 — config-driven DERIVED field values. Counterpart to conditions.ts:
// conditions GATE a field; derive COMPUTES its value.
//
// Two pure kinds (statusMap, formula) are isomorphic — they run reactively on the
// client AND are re-enforced on the server at save time, so a derived column is
// always authoritative. Two async kinds (fromRelated, template) need a DB lookup
// and resolve through POST /api/pages/:slug/derive (see deriveSources.ts).
//
// The business values (which date combo maps to which status, the MCA template
// string, which source column feeds which field) live in the JSONB config, never
// here. This module only knows how to evaluate the shapes.

import { evaluatePredicate, type Predicate } from './conditions';

export interface StatusMapDerive {
  kind: 'statusMap';
  rules: Array<{ when: Predicate; value: string | number }>;
  default?: string | number;
}

export interface FormulaDerive {
  kind: 'formula';
  op: 'subtract' | 'add' | 'sum';
  fields: string[];
}

// Tiered lookup: pick the first matching rule and resolve a value. A rule (or the
// default) yields either a flat `value` or `rate * base` (base = a numeric field),
// which expresses the export charge tables (CEEC weight≥30→800; LMC goods8→w×8 etc.)
// and the OGEFREM container tiers entirely as JSONB config — no hardcoded math.
// Pure + isomorphic: computed reactively on the client and re-enforced on save.
export interface TieredDerive {
  kind: 'tiered';
  /** Field whose numeric value multiplies a rule's `rate` (e.g. 'weight'). */
  base?: string;
  rules: Array<{ when: Predicate; value?: number; rate?: number }>;
  default?: { value?: number; rate?: number };
}

export interface FromRelatedDerive {
  kind: 'fromRelated';
  // The field whose change triggers this fetch (e.g. 'license_id').
  trigger: string;
  // A vetted source name in deriveSources.ts (e.g. 'license', 'client').
  source: string;
  // Column on the resolved source row to copy.
  column: string;
  // Optional mapping of the raw value to a display value (e.g. {"1":"Client"}).
  valueMap?: Record<string, string>;
}

export interface TemplateDerive {
  kind: 'template';
  trigger: string;
  source: string;
  // Interpolation string over tokens the source returns, e.g.
  // "{client_short}-{kind_short}{goods_short}{transport_letter}{year}-{seq}".
  template: string;
}

// Count of comma-separated non-empty values in another field (e.g. number_of_seals
// from the dgda_seal_no list). Pure — recomputed on the client and re-enforced on save.
export interface CountDerive {
  kind: 'count';
  field: string;
}

export type DeriveSpec =
  | StatusMapDerive
  | FormulaDerive
  | TieredDerive
  | CountDerive
  | FromRelatedDerive
  | TemplateDerive;

type Values = Record<string, unknown>;

export function parseDerive(raw: unknown): DeriveSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as DeriveSpec;
}

export function isPureDerive(
  spec: DeriveSpec | null,
): spec is StatusMapDerive | FormulaDerive | TieredDerive | CountDerive {
  return !!spec && (spec.kind === 'statusMap' || spec.kind === 'formula' || spec.kind === 'tiered' || spec.kind === 'count');
}

export function isAsyncDerive(spec: DeriveSpec | null): spec is FromRelatedDerive | TemplateDerive {
  return !!spec && (spec.kind === 'fromRelated' || spec.kind === 'template');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute a pure derive (statusMap / formula) from the current form values.
 * Returns the derived value, or undefined when it can't/shouldn't compute (the
 * caller then leaves the field untouched).
 */
export function computePureDerive(spec: DeriveSpec | null, values: Values): string | number | undefined {
  if (!spec) return undefined;
  if (spec.kind === 'statusMap') {
    for (const rule of spec.rules) {
      if (evaluatePredicate(rule.when, values)) return rule.value;
    }
    return spec.default;
  }
  if (spec.kind === 'formula') {
    const nums = spec.fields.map((f) => num(values[f]));
    if (nums.length === 0) return undefined;
    if (spec.op === 'subtract') return nums.reduce((a, b) => a - b);
    // add and sum both total the operands.
    return nums.reduce((a, b) => a + b, 0);
  }
  if (spec.kind === 'tiered') {
    const base = spec.base ? num(values[spec.base]) : 0;
    const resolve = (r?: { value?: number; rate?: number }): number | undefined => {
      if (!r) return undefined;
      if (r.value !== undefined && r.value !== null) return r.value;
      if (r.rate !== undefined && r.rate !== null) return r.rate * base;
      return undefined;
    };
    for (const rule of spec.rules) {
      if (evaluatePredicate(rule.when, values)) {
        const v = resolve(rule);
        if (v !== undefined) return v;
      }
    }
    return resolve(spec.default);
  }
  if (spec.kind === 'count') {
    const v = values[spec.field];
    if (v === undefined || v === null || v === '') return 0;
    return String(v).split(',').map((s) => s.trim()).filter(Boolean).length;
  }
  return undefined;
}

/** Render a template string against a flat token object from a derive source. */
export function renderTemplate(template: string, tokens: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = tokens[k];
    return v === null || v === undefined ? '' : String(v);
  });
}
