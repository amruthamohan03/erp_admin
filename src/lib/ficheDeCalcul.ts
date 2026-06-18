import { z } from 'zod';
import { applyRule, loadTaxRule } from '@/engine/rules';
import { BadRequestError } from '@/lib/errors';
import type { TaxRuleMasterRow } from '@/db/schema';

// Fiche de Calcul — composes multiple tax_rule_master_t formulas into a
// single calculation breakdown per root CLAUDE.md §2 step 3.
//
// Inputs:
//   * `entity` — the base context every formula sees as `entity.*`. At
//     minimum it must carry an `amount` (numeric). Callers can add other
//     keys (e.g. `weight_kg`) that custom formulas reference.
//   * `ruleKeys` — ordered list of tax_rule_master_t.rule_key values. Each
//     rule is evaluated against the same entity context; for cascading
//     calculations (e.g. VAT on duty-inclusive amount) the caller stacks
//     calls and rebuilds the entity context between them.
//
// Output: structured breakdown — one line per rule with its computed
// value, plus a total. Non-numeric formula results are flagged as errors
// on that line so the caller can surface the misconfiguration.

export const ficheDeCalculEntitySchema = z
  .object({
    amount: z.number().nonnegative(),
  })
  .catchall(z.unknown());

export type FicheDeCalculEntity = z.infer<typeof ficheDeCalculEntitySchema>;

export interface FicheDeCalculLine {
  ruleKey: string;
  name: string;
  scope: string | null;
  /** Numeric formula result, or `null` when the formula didn't produce one. */
  value: number | null;
  /** Set when `value` is null — explains why. */
  error?: string;
}

export interface FicheDeCalculResult {
  /** Echo of the entity context (handy for audit trails). */
  entity: FicheDeCalculEntity;
  /** ISO date the rates were applied against (asOf). */
  asOf: string;
  lines: FicheDeCalculLine[];
  /** Sum of the numeric values across all lines. */
  total: number;
}

function asNumeric(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Pure compose helper. Takes pre-loaded rule rows so it's directly unit-
 * testable — `computeFiche` (below) is the DB-bound wrapper that the
 * route calls.
 *
 * Non-numeric formula results don't throw — they land on the line as a
 * `null` value + an explanatory `error`. Lets a misconfigured single
 * rule show up in the UI without blowing up the whole calculation.
 */
export function composeFiche(args: {
  entity: FicheDeCalculEntity;
  rules: TaxRuleMasterRow[];
  asOf: Date;
}): FicheDeCalculResult {
  if (args.rules.length === 0) {
    throw new BadRequestError('composeFiche: rules must not be empty');
  }
  const context = { entity: args.entity };

  const lines: FicheDeCalculLine[] = args.rules.map((rule) => {
    const raw = applyRule(rule.formula, context);
    const numeric = asNumeric(raw);
    return {
      ruleKey: rule.ruleKey,
      name: rule.name,
      scope: rule.scope,
      value: numeric,
      ...(numeric == null
        ? { error: `Formula produced a non-numeric result: ${JSON.stringify(raw)}` }
        : {}),
    };
  });

  const total = lines.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return {
    entity: args.entity,
    asOf: args.asOf.toISOString().slice(0, 10),
    lines,
    total,
  };
}

/**
 * DB-bound entry point — loads each tax_rule_master_t row by key, then
 * delegates to composeFiche. asOf defaults to today; loadTaxRule uses it
 * to pick the most-recently-effective rule row.
 */
export async function computeFiche(args: {
  entity: FicheDeCalculEntity;
  ruleKeys: string[];
  asOf?: Date;
}): Promise<FicheDeCalculResult> {
  if (args.ruleKeys.length === 0) {
    throw new BadRequestError('computeFiche: ruleKeys must not be empty');
  }
  const asOf = args.asOf ?? new Date();
  const rules: TaxRuleMasterRow[] = [];
  for (const ruleKey of args.ruleKeys) {
    rules.push(await loadTaxRule(ruleKey, asOf));
  }
  return composeFiche({ entity: args.entity, rules, asOf });
}
