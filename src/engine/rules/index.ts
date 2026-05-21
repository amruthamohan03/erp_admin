import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ruleMaster, type RuleMasterRow } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Rule engine entry point per root CLAUDE.md §4.2.
//
// `ruleKey` is the stable string identifier from `rule_master_t.rule_key`
// (spec calls it ruleId but ids drift across deployments — keys don't).
//
// `rule_json` format is intentionally undecided: pick JSON Logic, CEL, or a
// custom DSL when the first real rule lands, then add the evaluator below.
// Today this stub loads the rule but refuses to evaluate so a premature
// caller fails loudly rather than silently allowing/denying.

export type RuleContext = Record<string, unknown>;

export async function loadRule(ruleKey: string): Promise<RuleMasterRow> {
  const [row] = await db
    .select()
    .from(ruleMaster)
    .where(and(eq(ruleMaster.ruleKey, ruleKey), eq(ruleMaster.display, 'Y')))
    .limit(1);
  if (!row) throw new NotFoundError(`Rule not found: ${ruleKey}`);
  return row;
}

export async function evaluateRule(
  ruleKey: string,
  _context: RuleContext,
): Promise<unknown> {
  await loadRule(ruleKey);
  throw new Error(
    `evaluateRule: rule "${ruleKey}" loaded but no evaluator is wired up yet. ` +
      `Pick a rule_json format and implement evaluation in src/engine/rules/.`,
  );
}
