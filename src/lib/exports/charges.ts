import { applyRule } from '@/engine/rules';
import { db } from '@/lib/db';
import { taxRuleMaster } from '@/db/schema';
import { and, eq, inArray, isNull, lte, gte, or, desc } from 'drizzle-orm';

// Config-driven per-row export charges. Ports main's `tiered`
// derive concept onto this branch's tax-rule engine (JSON Logic +
// tax_rule_master_t).
//
// One rule per charge column, keyed by
// `drc.export_charge.<column>`. Each rule is evaluated against
// { weight, fob, type_of_goods_id, feet_container_id } from the
// export row; the numeric result populates the amount column.
//
// Missing / disabled rules → null column (no charge). That's the
// safe default when an operator hasn't defined a rule for a
// particular jurisdiction — main's bulk-insert did the same.

export const EXPORT_CHARGE_COLUMNS = [
  'ceec_amount',
  'cgea_amount',
  'occ_amount',
  'lmc_amount',
  'ogefrem_amount',
] as const;
export type ExportChargeColumn = (typeof EXPORT_CHARGE_COLUMNS)[number];

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

/**
 * Pre-load every live, currently-effective export-charge rule in
 * one round-trip so bulk-create doesn't hit the DB per row. Same
 * effective-date filter as loadTaxRule; wins go to the most
 * recently effective row per key.
 */
export async function loadExportChargeRules(
  asOf: Date = new Date(),
): Promise<Map<ExportChargeColumn, unknown>> {
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
  const byKey = new Map<ExportChargeColumn, unknown>();
  for (const r of rows) {
    const col = EXPORT_CHARGE_COLUMNS.find((c) => ruleKeyFor(c) === r.ruleKey);
    if (!col) continue;
    if (byKey.has(col)) continue;
    byKey.set(col, r.formula);
  }
  return byKey;
}

/**
 * Apply the pre-loaded rules to one row's context. Numeric strings
 * are returned so callers can pipe them straight into Drizzle's
 * `numeric(15,2)` columns without a precision-losing round-trip.
 */
export function computeExportCharges(
  rules: ReadonlyMap<ExportChargeColumn, unknown>,
  ctx: ExportChargeContext,
): ExportChargeAmounts {
  const out: ExportChargeAmounts = {
    ceec_amount: null,
    cgea_amount: null,
    occ_amount: null,
    lmc_amount: null,
    ogefrem_amount: null,
  };
  for (const col of EXPORT_CHARGE_COLUMNS) {
    const formula = rules.get(col);
    if (formula === undefined || formula === null) continue;
    const raw = applyRule(formula, ctx as unknown as Record<string, unknown>);
    if (raw === undefined || raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[col] = n.toFixed(2);
  }
  return out;
}
