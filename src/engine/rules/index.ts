import jsonLogic from 'json-logic-js';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  ruleMaster,
  taxRuleMaster,
  type RuleMasterRow,
  type TaxRuleMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Rule engine per root CLAUDE.md §4.2.
//
// Format: JSON Logic (https://jsonlogic.com). Declarative JSON expression —
// safe to store in rule_master_t.rule_json, edit through an admin UI, and
// evaluate at request time without an interpreter or `eval`.
//
// Example: gate a workflow transition on draft status + amount over 1000:
//   {
//     "and": [
//       { "==": [{ "var": "status" }, "draft"] },
//       { ">":  [{ "var": "amount" }, 1000] }
//     ]
//   }
//
// Code looks rules up by `ruleKey` (stable string), never id. Spec calls it
// ruleId — ids drift across deployments, keys don't.

export type RuleContext = Record<string, unknown>;

// Apply a JSON Logic expression to a context. Pure — no DB. Useful when the
// expression is already in hand (e.g. evaluated inline, or piped from a
// workflow transition row).
export function applyRule(ruleJson: unknown, context: RuleContext = {}): unknown {
  if (ruleJson === undefined || ruleJson === null) {
    throw new Error('applyRule: rule_json is empty');
  }
  // json-logic-js accepts the full RulesLogic union; the DB column is jsonb
  // so it lands here as `unknown`. Cast at this single boundary.
  return jsonLogic.apply(
    ruleJson as Parameters<typeof jsonLogic.apply>[0],
    context,
  );
}

// Fetch a rule row by key. Throws NotFoundError on missing or display='N'.
export async function loadRule(ruleKey: string): Promise<RuleMasterRow> {
  const [row] = await db
    .select()
    .from(ruleMaster)
    .where(and(eq(ruleMaster.ruleKey, ruleKey), eq(ruleMaster.display, 'Y')))
    .limit(1);
  if (!row) throw new NotFoundError(`Rule not found: ${ruleKey}`);
  return row;
}

// Fetch a rule row by primary key. Used when a row from another table holds
// a FK (e.g. workflow_transition_master_t.rule_id) and round-tripping through
// rule_key would be wasteful. Throws NotFoundError on missing or display='N'.
export async function loadRuleById(id: number): Promise<RuleMasterRow> {
  const [row] = await db
    .select()
    .from(ruleMaster)
    .where(and(eq(ruleMaster.id, id), eq(ruleMaster.display, 'Y')))
    .limit(1);
  if (!row) throw new NotFoundError(`Rule not found: id=${id}`);
  return row;
}

// Load a rule by key, then apply its rule_json against the given context.
export async function evaluateRule(
  ruleKey: string,
  context: RuleContext = {},
): Promise<unknown> {
  const rule = await loadRule(ruleKey);
  return applyRule(rule.ruleJson, context);
}

// --- Tax rules (tax_rule_master_t) -----------------------------------------
//
// Same JSON Logic format as rule_master_t but the rows carry jurisdiction +
// scope + effective dates so they can change over time without deletion.
// Loading filters by:
//   * exact rule_key match
//   * display='Y'
//   * effectiveFrom is null OR effectiveFrom <= asOf
//   * effectiveTo   is null OR effectiveTo   >= asOf
// then orders by effective_from DESC so the most-recently-effective rule
// wins when versions overlap.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadTaxRule(
  ruleKey: string,
  asOf: Date = new Date(),
): Promise<TaxRuleMasterRow> {
  const date = isoDate(asOf);
  const [row] = await db
    .select()
    .from(taxRuleMaster)
    .where(
      and(
        eq(taxRuleMaster.ruleKey, ruleKey),
        eq(taxRuleMaster.display, 'Y'),
        or(
          isNull(taxRuleMaster.effectiveFrom),
          lte(taxRuleMaster.effectiveFrom, date),
        ),
        or(
          isNull(taxRuleMaster.effectiveTo),
          gte(taxRuleMaster.effectiveTo, date),
        ),
      ),
    )
    .orderBy(desc(taxRuleMaster.effectiveFrom))
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      `Tax rule not found or not in effect on ${date}: ${ruleKey}`,
    );
  }
  return row;
}

export async function evaluateTaxRule(
  ruleKey: string,
  context: RuleContext = {},
  asOf: Date = new Date(),
): Promise<unknown> {
  const rule = await loadTaxRule(ruleKey, asOf);
  return applyRule(rule.formula, context);
}
