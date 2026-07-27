// §9 Bulk Update — the ONE mapping of each "pending" dashboard filter to the
// fields its bulk-edit modal exposes, plus each field's label/type and the write
// whitelist. Shared by the bulk-update API (validation + whitelist) and the
// modal (rendering), so the two can't drift.
//
// Pure config (no DB import) → safe to import from the client component too.

export type BulkFieldType = 'date' | 'number' | 'text';

// Filter key → editable field names (imports_t columns). Only the ten "pending"
// filters qualify; the three clearing-status cards name no field and are absent.
export const BULK_FIELD_MAP: Record<string, string[]> = {
  crf_missing: ['crf_reference', 'crf_received_date'],
  ad_missing: ['ad_date'],
  insurance_missing: ['insurance_date', 'insurance_amount', 'insurance_reference'],
  audited_pending: ['audited_date'],
  archived_pending: ['archived_date', 'archive_reference'],
  dgda_in_pending: ['dgda_in_date', 'declaration_reference'],
  liquidation_pending: ['liquidation_date', 'liquidation_reference'],
  quittance_pending: ['quittance_date', 'quittance_reference'],
  dgda_out_pending: ['quittance_date', 'quittance_reference', 'dgda_out_date'],
  dispatch_deliver_pending: ['warehouse_arrival_date', 'warehouse_departure_date', 'dispatch_deliver_date'],
};

// These two filters also widen the read-only columns so the operator can identify
// the truck they're filling dates in for.
export const TRUCK_READONLY_FILTERS = new Set(['dispatch_deliver_pending', 'dgda_out_pending']);
export const TRUCK_FIELDS = ['horse', 'trailer_1', 'trailer_2', 'container'];

export const FIELD_META: Record<string, { label: string; type: BulkFieldType }> = {
  crf_reference: { label: 'CRF Reference', type: 'text' },
  crf_received_date: { label: 'CRF Received', type: 'date' },
  ad_date: { label: 'AD Date', type: 'date' },
  insurance_date: { label: 'Insurance Date', type: 'date' },
  insurance_amount: { label: 'Insurance Amount', type: 'number' },
  insurance_reference: { label: 'Insurance Ref', type: 'text' },
  audited_date: { label: 'Audited Date', type: 'date' },
  archived_date: { label: 'Archived Date', type: 'date' },
  archive_reference: { label: 'Archive Ref', type: 'text' },
  dgda_in_date: { label: 'DGDA In Date', type: 'date' },
  declaration_reference: { label: 'Declaration Ref', type: 'text' },
  liquidation_date: { label: 'Liquidation Date', type: 'date' },
  liquidation_reference: { label: 'Liquidation Ref', type: 'text' },
  quittance_date: { label: 'Quittance Date', type: 'date' },
  quittance_reference: { label: 'Quittance Ref', type: 'text' },
  dgda_out_date: { label: 'DGDA Out Date', type: 'date' },
  warehouse_arrival_date: { label: 'Warehouse Arrival', type: 'date' },
  warehouse_departure_date: { label: 'Warehouse Departure', type: 'date' },
  dispatch_deliver_date: { label: 'BS Date', type: 'date' },
  // truck identity (read-only)
  horse: { label: 'Horse', type: 'text' },
  trailer_1: { label: 'Trailer 1', type: 'text' },
  trailer_2: { label: 'Trailer 2', type: 'text' },
  container: { label: 'Container', type: 'text' },
};

// The write whitelist — the union of every editable field the map can offer.
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
