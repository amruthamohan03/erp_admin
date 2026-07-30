import { insertSeedRows, type SeedTable } from './insertSeedRows';
import referenceMastersJson from './data/reference-masters.json';
import type { Database, Transaction } from '@/lib/db';

// §4.1 — the DRC lookup masters every transactional module reads: currencies,
// origins/provinces, transit points, transport modes, goods types, kinds,
// regimes, clearance + status vocabularies, commodities, incoterms, phases,
// departments, expense types, banks, payment types/subtypes, quotation
// categories + billable items, the DRC public-holiday calendar, and the
// bank exchange-rate history the Fiche de Calcul reads.
//
// Provenance: captured from the production erp_admin database (the same rows
// main has been running on) with created_by/updated_by blanked — a freshly
// migrated DB only has the admin user that scripts/seed-admin.js creates.
// Ids are preserved; see insertSeedRows for why that matters.
//
// Adding a value to one of these masters is a config change: edit the row in
// the admin screen, and re-capture ./data/reference-masters.json only when the
// baseline every deployment should start from actually moves.

// JSON import boundary — the module's inferred literal type is unusable at this
// size, so it is narrowed once here (§6: casts allowed at parse boundaries).
const REFERENCE_MASTERS = referenceMastersJson as unknown as Record<string, SeedTable>;

// Parent → child. province needs origin, office_location needs province,
// payment_subtype needs payment_type, item needs quotation_category.
const ORDER: readonly string[] = [
  'currency_master_t',
  'origin_master_t',
  'province_master_t',
  'office_location_master_t',
  'main_office_master_t',
  'transit_point_master_t',
  'transport_mode_master_t',
  'type_of_goods_master_t',
  'unit_master_t',
  'kind_master_t',
  'regime_master_t',
  'clearance_master_t',
  'clearing_status_master_t',
  'document_status_master_t',
  'truck_status_master_t',
  'commodity_master_t',
  'incoterm_master_t',
  'industry_master_t',
  'phase_master_t',
  'referer_master_t',
  'done_by_master_t',
  'department_master_t',
  'expense_type_master_t',
  'feet_container_master_t',
  'banklist_master_t',
  'invoice_bank_master_t',
  'payment_type_master_t',
  'payment_subtype_master_t',
  'quotation_category_master_t',
  'item_master_t',
  'drc_holidays_t',
  // Needs banks + currencies above.
  'bank_exchange_rate_t',
];

export async function seedReferenceMasters(db: Database | Transaction): Promise<void> {
  for (const table of ORDER) {
    await insertSeedRows(db, table, REFERENCE_MASTERS[table]);
  }
}
