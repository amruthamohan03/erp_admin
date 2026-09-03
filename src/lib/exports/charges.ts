import { applyRule } from '@/engine/rules';
import { db } from '@/lib/db';
import {
  taxRuleMaster,
  masterPage,
  masterPageAccordion,
  masterPageAccordionField,
} from '@/db/schema';
import { and, eq, inArray, isNull, like, lte, gte, or, desc } from 'drizzle-orm';
import { parseDerive, isPureDerive, computePureDerive } from '@/lib/pages/derive';

// Config-driven per-row export charges. ONE resolver, so the create grid's
// preview, the bulk insert and the single-record form can never disagree about
// what a consignment is charged.
//
// TWO config sources, in precedence order:
//
//   1. tax_rule_master_t — a JSON Logic formula per column, keyed
//      `drc.export_charge.<column>`, with effective-from/to dates. The intended
//      home for a jurisdiction's tariff, and the one that can be versioned.
//
//   2. The export page's own `tiered` derive on that amount field
//      (master_page_accordion_field_t), which is what the single-record form
//      already evaluates client-side.
//
// The fallback is not belt-and-braces — it is a correctness fix. Only (2) is
// populated: `tax_rule_master_t` holds no export charge rules at all, so every
// export created from the grid was written with all five amounts NULL while the
// same consignment opened on the transaction page showed the real figures. One
// resolver reading both means the grid, the insert and the form now agree, and
// configuring a tax rule later takes over cleanly.
//
// Neither source configured → null column (no charge), which is the right answer
// when an operator has not defined a tariff for that jurisdiction.

export const EXPORT_CHARGE_COLUMNS = [
  'ceec_amount',
  'cgea_amount',
  'occ_amount',
  'lmc_amount',
  'ogefrem_amount',
] as const;
export type ExportChargeColumn = (typeof EXPORT_CHARGE_COLUMNS)[number];

/** Charges that only apply once the row carries goods — see computeExportCharges. */
const WEIGHT_GATED_COLUMNS = new Set<ExportChargeColumn>([
  'ceec_amount',
  'cgea_amount',
  'occ_amount',
  'lmc_amount',
]);

const ruleKeyFor = (col: ExportChargeColumn): string =>
  `drc.export_charge.${col}`;

export interface ExportChargeContext {
  weight: number;
  fob: number;
  type_of_goods_id: number | null;
  feet_container_id: number | null;
}

export interface ExportChargeAmounts {
  ceec_amount: string | null;
  cgea_amount: string | null;
  occ_amount: string | null;
  lmc_amount: string | null;
  ogefrem_amount: string | null;
}

/** Where a column's amount came from — the two shapes evaluate differently. */
export type ExportChargeRule =
  | { source: 'tax_rule'; formula: unknown }
  | { source: 'field_derive'; spec: unknown };

/**
 * Pre-load every live, currently-effective export-charge rule in one round-trip
 * so bulk-create doesn't hit the DB per row.
 *
 * Tax rules first; any column they do not cover falls back to the export page's
 * own `tiered` derive for that field. Same effective-date filter as loadTaxRule;
 * wins go to the most recently effective row per key.
 */
export async function loadExportChargeRules(
  asOf: Date = new Date(),
): Promise<Map<ExportChargeColumn, ExportChargeRule>> {
  const byKey = await loadTaxRuleFormulas(asOf);

  // Only for the columns no tax rule covers — a configured tariff always wins.
  const missing = EXPORT_CHARGE_COLUMNS.filter((c) => !byKey.has(c));
  if (missing.length > 0) {
    const rows = await db
      .select({ name: masterPageAccordionField.name, derive: masterPageAccordionField.derive })
      .from(masterPageAccordionField)
      .innerJoin(masterPageAccordion, eq(masterPageAccordion.id, masterPageAccordionField.accordionId))
      .innerJoin(masterPage, eq(masterPage.id, masterPageAccordion.pageId))
      .where(
        and(
          eq(masterPage.slug, 'export'),
          eq(masterPageAccordion.display, 'Y'),
          like(masterPageAccordionField.name, '%_amount'),
        ),
      );
    for (const r of rows) {
      const col = missing.find((c) => c === r.name);
      if (!col || r.derive == null) continue;
      byKey.set(col, { source: 'field_derive', spec: r.derive });
    }
  }

  return byKey;
}

async function loadTaxRuleFormulas(
  asOf: Date,
): Promise<Map<ExportChargeColumn, ExportChargeRule>> {
  const date = asOf.toISOString().slice(0, 10);
  const keys = EXPORT_CHARGE_COLUMNS.map(ruleKeyFor);

  const rows = await db
    .select({
      ruleKey: taxRuleMaster.ruleKey,
      formula: taxRuleMaster.formula,
      effectiveFrom: taxRuleMaster.effectiveFrom,
    })
    .from(taxRuleMaster)
    .where(
      and(
        inArray(taxRuleMaster.ruleKey, keys),
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
    .orderBy(desc(taxRuleMaster.effectiveFrom));

  // Multiple rows can match the same key when versions overlap;
  // the DESC-order query above puts the winner first — keep it.
  const byKey = new Map<ExportChargeColumn, ExportChargeRule>();
  for (const r of rows) {
    const col = EXPORT_CHARGE_COLUMNS.find((c) => ruleKeyFor(c) === r.ruleKey);
    if (!col) continue;
    if (byKey.has(col)) continue;
    byKey.set(col, { source: 'tax_rule', formula: r.formula });
  }
  return byKey;
}

/**
 * Apply the pre-loaded rules to one row's context. Numeric strings
 * are returned so callers can pipe them straight into Drizzle's
 * `numeric(15,2)` columns without a precision-losing round-trip.
 */
export function computeExportCharges(
  rules: ReadonlyMap<ExportChargeColumn, ExportChargeRule>,
  ctx: ExportChargeContext,
): ExportChargeAmounts {
  const out: ExportChargeAmounts = {
    ceec_amount: null,
    cgea_amount: null,
    occ_amount: null,
    lmc_amount: null,
    ogefrem_amount: null,
  };

  // A page-field derive names its inputs the way the FORM does — `type_of_goods`,
  // `feet_container` — while a tax rule names them the way the ROW does. Both
  // spellings are supplied so a rule written against either vocabulary resolves,
  // rather than silently evaluating an absent field to nothing.
  const vars: Record<string, unknown> = {
    ...ctx,
    type_of_goods: ctx.type_of_goods_id,
    feet_container: ctx.feet_container_id,
  };

  for (const col of EXPORT_CHARGE_COLUMNS) {
    // A row with no weight is not a consignment yet, so the charges that follow
    // the goods are zero until there are some.
    //
    // Without this, a blank row carried the flat fees and the base tier —
    // CEEC 600, CGEA 80, OCC 250 — so adding five rows and filling two would
    // have written 930 of charges onto each of the three that were left empty.
    // OGEFREM is not in the list: it is driven by the container, not the weight,
    // and already resolves to nothing when no container is chosen.
    if (ctx.weight <= 0 && WEIGHT_GATED_COLUMNS.has(col)) {
      out[col] = '0.00';
      continue;
    }

    const rule = rules.get(col);
    if (!rule) continue;

    let raw: unknown;
    if (rule.source === 'tax_rule') {
      if (rule.formula === null || rule.formula === undefined) continue;
      raw = applyRule(rule.formula, vars);
    } else {
      // The same `tiered` evaluator the single-record form runs (§4.10), so the
      // grid, the insert and the form all read one config and get one answer.
      const spec = parseDerive(rule.spec);
      if (!isPureDerive(spec)) continue;
      raw = computePureDerive(spec, vars);
    }

    if (raw === undefined || raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[col] = n.toFixed(2);
  }
  return out;
}
