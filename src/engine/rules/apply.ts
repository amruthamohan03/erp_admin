import jsonLogic from 'json-logic-js';

// The pure half of the rule engine (§4.2): evaluate a JSON Logic expression
// against a context. No database import, so a client component can run the SAME
// formula the server runs — the Fiche de Calcul grid previews its CIF and DDI
// from the tax_rule_master_t formulas the save route recomputes with.
// index.ts re-exports this and adds the DB-backed loaders.

export type RuleContext = Record<string, unknown>;

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
