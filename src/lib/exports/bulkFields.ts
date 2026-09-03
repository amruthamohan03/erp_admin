// §8 Export Bulk Update — the ONE mapping of each "pending" dashboard filter to
// the fields its bulk-edit modal exposes, plus each field's label/type and the
// write whitelist. Shared by the bulk-update API (validation + whitelist) and
// the modal (rendering), so the two cannot drift.
//
// The export twin of src/lib/imports/bulkFields.ts. Kept as its own file rather
// than generalised over both: the two tables share almost no milestone columns
// (exports have CEEC / Min Div / Gov Docs / LMC / OGEFREM, imports have CRF / AD
// / insurance), so a shared map would be two disjoint halves behind one name.
//
// Pure config (no DB import) → safe to import from the client component too.
//
// The write whitelist is deliberately CODE-defined, matching src/lib/bulkUpdate.ts:
// a mass edit skips the per-record form's validation and workflow, so which
// columns it may touch is a reviewed decision, not a config row.

export type BulkFieldType = 'date' | 'number' | 'text';

/**
 * Filter key → editable field names (exports_t columns).
 *
 * Only the "pending" filters qualify — each names the column whose emptiness the
 * card counts, so the modal offers exactly what the operator came to fill in.
 * The three clearing-status cards (completed / in progress / in transit) describe
 * a state rather than a missing value, so they contribute no editable fields and
 * are deliberately absent. Keys here must exist in src/db/queries/exportFilters.ts.
 */
export const BULK_FIELD_MAP: Record<string, string[]> = {
  ceec_pending: ['ceec_in_date', 'ceec_out_date'],
  min_div_pending: ['min_div_in_date', 'min_div_out_date'],
  gov_docs_pending: ['gov_docs_in_date', 'gov_docs_out_date'],
  audited_pending: ['audited_date'],
  archived_pending: ['archived_date', 'archive_reference'],
  dgda_in_pending: ['dgda_in_date', 'declaration_reference'],
  liquidation_pending: ['liquidation_date', 'liquidation_reference'],
  quittance_pending: ['quittance_date', 'quittance_reference'],
  dispatch_pending: ['dispatch_deliver_date'],
  // Seal numbers only — No. of Seals is COUNTED from them by the same `count`
  // derive the single-record form uses (§4.10), so offering it as a second
  // editable field would let the two disagree.
  seal_pending: ['dgda_seal_no'],
  lmc_id_pending: ['lmc_id'],
  lmc_date_pending: ['lmc_date'],
  ogefrem_ref_pending: ['ogefrem_inv_ref'],
  ogefrem_date_pending: ['ogefrem_date'],
};

// Filling a date for a truck means knowing WHICH truck — these filters widen the
// read-only columns so the row can be identified without opening the record.
export const TRUCK_READONLY_FILTERS = new Set(['dispatch_pending', 'seal_pending']);
export const TRUCK_FIELDS = ['horse', 'trailer_1', 'trailer_2', 'container'];

export const FIELD_META: Record<string, { label: string; type: BulkFieldType }> = {
  ceec_in_date: { label: 'CEEC In', type: 'date' },
  ceec_out_date: { label: 'CEEC Out', type: 'date' },
  min_div_in_date: { label: 'Min Div In', type: 'date' },
  min_div_out_date: { label: 'Min Div Out', type: 'date' },
  gov_docs_in_date: { label: 'Gov Docs In', type: 'date' },
  gov_docs_out_date: { label: 'Gov Docs Out', type: 'date' },
  audited_date: { label: 'Audited Date', type: 'date' },
  archived_date: { label: 'Archived Date', type: 'date' },
  archive_reference: { label: 'Archive Ref', type: 'text' },
  dgda_in_date: { label: 'DGDA In Date', type: 'date' },
  declaration_reference: { label: 'Declaration Ref', type: 'text' },
  liquidation_date: { label: 'Liquidation Date', type: 'date' },
  liquidation_reference: { label: 'Liquidation Ref', type: 'text' },
  quittance_date: { label: 'Quittance Date', type: 'date' },
  quittance_reference: { label: 'Quittance Ref', type: 'text' },
  dispatch_deliver_date: { label: 'BS Date', type: 'date' },
  dgda_seal_no: { label: 'DGDA Seal No', type: 'text' },
  number_of_seals: { label: 'No. of Seals', type: 'number' },
  lmc_id: { label: 'LMC ID', type: 'text' },
  lmc_date: { label: 'LMC Date', type: 'date' },
  ogefrem_inv_ref: { label: 'OGEFREM Inv. Ref', type: 'text' },
  ogefrem_date: { label: 'OGEFREM Date', type: 'date' },
  // truck identity (read-only)
  horse: { label: 'Horse', type: 'text' },
  trailer_1: { label: 'Trailer 1', type: 'text' },
  trailer_2: { label: 'Trailer 2', type: 'text' },
  container: { label: 'Container', type: 'text' },
};

/** The write whitelist — the union of every editable field the map can offer. */
export const BULK_WHITELIST = new Set(Object.values(BULK_FIELD_MAP).flat());

export function isPendingFilter(key: string): boolean {
  return key in BULK_FIELD_MAP;
}

/** Editable fields for the active filter set (union, de-duplicated, stable order). */
export function relevantFieldsFor(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    for (const f of BULK_FIELD_MAP[key] ?? []) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

/** Read-only truck columns, shown only when a truck-widening filter is active. */
export function readonlyFieldsFor(keys: string[]): string[] {
  return keys.some((k) => TRUCK_READONLY_FILTERS.has(k)) ? [...TRUCK_FIELDS] : [];
}
