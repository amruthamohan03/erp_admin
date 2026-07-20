import { sql } from 'drizzle-orm';
import { taxRuleMaster, type TaxRuleMasterInsert } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sample tax / duty rules for Fiche de Calcul (§2 step 3 / §4.1 / §4.2).
//
// Formulas are JSON Logic — evaluated by applyRule in src/engine/rules
// against a context the caller assembles. By convention the context shape
// is `{ entity: { amount, ... }, ... }` so formulas can reference
// `{ var: "entity.amount" }`.
//
// These rates are *starting points* — real DRC OGEFREM / OFIDA rates will
// change over time. effective_from / effective_to let admins replace them
// without deletion; loadTaxRule picks the most-recently-effective row.

interface SeedRow {
  ruleKey: string;
  name: string;
  description: string;
  jurisdiction: string;
  scope: string;
  displayOrder: number;
  formula: unknown;
}

const rows: SeedRow[] = [
  {
    ruleKey: 'drc.import_duty.default',
    name: 'DRC import duty (default)',
    description: '10 % import duty applied to the entity amount.',
    jurisdiction: 'DRC',
    scope: 'import_duty',
    displayOrder: 10,
    formula: { '*': [{ var: 'entity.amount' }, 0.1] },
  },
  {
    ruleKey: 'drc.vat.standard',
    name: 'DRC VAT (standard)',
    description:
      '16 % VAT applied to the entity amount. Compose with import duty for ' +
      'cascading-VAT calculations by passing the duty-inclusive amount in ' +
      'the entity context.',
    jurisdiction: 'DRC',
    scope: 'vat',
    displayOrder: 20,
    formula: { '*': [{ var: 'entity.amount' }, 0.16] },
  },
  {
    ruleKey: 'drc.clearance_fee.flat',
    name: 'DRC clearance fee (flat)',
    description:
      '0.5 % flat customs clearance fee on the entity amount. Floors at ' +
      'USD 10 equivalent in case the percentage rounds below that.',
    jurisdiction: 'DRC',
    scope: 'clearance_fee',
    displayOrder: 30,
    formula: {
      max: [{ '*': [{ var: 'entity.amount' }, 0.005] }, 10],
    },
  },
  {
    ruleKey: 'drc.export_duty.default',
    name: 'DRC export duty (default)',
    description:
      '5 % export duty applied to the entity amount. Distinct from import ' +
      'duty so Export-tracked consignments can pick this rule explicitly.',
    jurisdiction: 'DRC',
    scope: 'export_duty',
    displayOrder: 40,
    formula: { '*': [{ var: 'entity.amount' }, 0.05] },
  },
  // ── Per-row export charges consumed by bulk-create ────────────────
  // Each rule computes ONE amount column on exports_t from a context
  // of { weight, fob, type_of_goods_id, feet_container_id }. Rates
  // are placeholders — real DRC OGEFREM/CEEC/CGEA/OCC/LMC rates
  // vary by commodity + tier + shipment mode. Edit the row from
  // /masters/tax-rules to override; the loader picks the most-
  // recently-effective row per key.
  {
    ruleKey: 'drc.export_charge.ceec_amount',
    name: 'CEEC — export inspection fee',
    description: 'Per-MT rate — $2/MT of shipped weight (placeholder).',
    jurisdiction: 'DRC',
    scope: 'export_charge',
    displayOrder: 60,
    formula: { '*': [{ var: 'weight' }, 2] },
  },
  {
    ruleKey: 'drc.export_charge.cgea_amount',
    name: 'CGEA — export management fee',
    description: '0.4 % of FOB (placeholder).',
    jurisdiction: 'DRC',
    scope: 'export_charge',
    displayOrder: 61,
    formula: { '*': [{ var: 'fob' }, 0.004] },
  },
  {
    ruleKey: 'drc.export_charge.occ_amount',
    name: 'OCC — control agency fee',
    description: '0.5 % of FOB (placeholder).',
    jurisdiction: 'DRC',
    scope: 'export_charge',
    displayOrder: 62,
    formula: { '*': [{ var: 'fob' }, 0.005] },
  },
  {
    ruleKey: 'drc.export_charge.lmc_amount',
    name: 'LMC — logistics chamber fee',
    description: '$1.50 per MT (placeholder).',
    jurisdiction: 'DRC',
    scope: 'export_charge',
    displayOrder: 63,
    formula: { '*': [{ var: 'weight' }, 1.5] },
  },
  {
    ruleKey: 'drc.export_charge.ogefrem_amount',
    name: 'OGEFREM — shippers council fee',
    description: '0.59 % of FOB (placeholder).',
    jurisdiction: 'DRC',
    scope: 'export_charge',
    displayOrder: 64,
    formula: { '*': [{ var: 'fob' }, 0.0059] },
  },
];

export async function seedTaxRules(db: Database | Transaction): Promise<void> {
  const values: TaxRuleMasterInsert[] = rows.map((r) => ({
    ruleKey: r.ruleKey,
    name: r.name,
    description: r.description,
    jurisdiction: r.jurisdiction,
    scope: r.scope,
    displayOrder: r.displayOrder,
    formula: r.formula,
  }));

  await db
    .insert(taxRuleMaster)
    .values(values)
    .onConflictDoUpdate({
      target: taxRuleMaster.ruleKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        jurisdiction: sql`excluded.jurisdiction`,
        scope: sql`excluded.scope`,
        displayOrder: sql`excluded.display_order`,
        formula: sql`excluded.formula`,
        updatedAt: sql`now()`,
      },
    });
}
