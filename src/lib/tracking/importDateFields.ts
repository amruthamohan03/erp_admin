// The dated milestones an import file collects, in the order they happen.
//
// ONE list (§4.10). It drives four things that main's dashboard kept as four
// separate hand-maintained copies — the Briefing completeness matrix, the
// "missing records" export cards, the custom export's date-field dropdown, and
// the WHERE clauses behind all of them. Those copies had already drifted: the
// matrix showed 25 columns while the export dropdown offered 25 and the cards
// 24, and nothing on screen explained which field the odd one out was.
//
// `key` is the real column name on `imports_t`, which is what lets the queries
// address a field with `sql.identifier` instead of a column map that has to be
// kept in step with this list.

export interface ImportDateField {
  /** Column on `imports_t`. */
  key: string;
  /** Full label — dropdowns, cards, export headers. */
  label: string;
  /** Short label for the completeness matrix, where 25 columns must fit. */
  short: string;
  /**
   * Only applicable to this transport mode, by its master letter.
   *
   * The two airport dates are never filled for a truck, so counting them as
   * "missing" across every file would report the whole road book as incomplete.
   */
  transportLetter?: 'A';
}

export const IMPORT_DATE_FIELDS: readonly ImportDateField[] = [
  { key: 'pre_alert_date', label: 'Pre Alert Date', short: 'Pre Alert' },
  { key: 'arrival_date_zambia', label: 'Arrival Date Zambia', short: 'Arr Zambia' },
  { key: 'dispatch_from_zambia', label: 'Dispatch From Zambia', short: 'Disp Zambia' },
  { key: 'drc_entry_date', label: 'DRC Entry Date', short: 'DRC Entry' },
  { key: 'border_warehouse_arrival_date', label: 'Border Warehouse Arrival', short: 'Border WH Arr' },
  { key: 'dispatch_from_border', label: 'Dispatch From Border', short: 'Disp Border' },
  { key: 'kanyaka_arrival_date', label: 'Kanyaka Arrival Date', short: 'Kanyaka Arr' },
  { key: 'kanyaka_dispatch_date', label: 'Kanyaka Dispatch Date', short: 'Kanyaka Disp' },
  { key: 'warehouse_arrival_date', label: 'Warehouse Arrival Date', short: 'WH Arrival' },
  { key: 'warehouse_departure_date', label: 'Warehouse Departure Date', short: 'WH Departure' },
  { key: 'dispatch_deliver_date', label: 'Dispatch Deliver Date', short: 'Disp/Deliver' },
  { key: 'airport_arrival_date', label: 'Airport Arrival Date', short: 'Airport Arr', transportLetter: 'A' },
  { key: 'dispatch_from_airport', label: 'Dispatch From Airport', short: 'Disp Airport', transportLetter: 'A' },
  { key: 'dgda_in_date', label: 'DGDA In Date', short: 'DGDA In' },
  { key: 'dgda_out_date', label: 'DGDA Out Date', short: 'DGDA Out' },
  { key: 'customs_manifest_date', label: 'Customs Manifest Date', short: 'Manifest Date' },
  { key: 'segues_payment_date', label: 'Segues Payment Date', short: 'Segues Pay' },
  { key: 'ad_date', label: 'AD Date', short: 'AD Date' },
  { key: 'insurance_date', label: 'Insurance Date', short: 'Insurance' },
  { key: 'crf_received_date', label: 'CRF Received Date', short: 'CRF Received' },
  { key: 'liquidation_date', label: 'Liquidation Date', short: 'Liquidation' },
  { key: 'quittance_date', label: 'Quittance Date', short: 'Quittance' },
  { key: 't1_date', label: 'T1 Date', short: 'T1 Date' },
  { key: 'audited_date', label: 'Audited Date', short: 'Audited' },
  { key: 'archived_date', label: 'Archived Date', short: 'Archived' },
] as const;

export const IMPORT_DATE_FIELD_KEYS: readonly string[] = IMPORT_DATE_FIELDS.map((f) => f.key);

export function isImportDateField(key: string): boolean {
  return IMPORT_DATE_FIELD_KEYS.includes(key);
}

export function importDateField(key: string): ImportDateField | undefined {
  return IMPORT_DATE_FIELDS.find((f) => f.key === key);
}

/**
 * The fields offered as a "missing records" export card.
 *
 * Pre Alert is excluded deliberately: it is the anchor the whole pipeline is
 * measured from, so a file without one is not at a stage — it has not started,
 * and the list's own filters are where that belongs.
 */
export const IMPORT_MISSING_CARD_FIELDS: readonly ImportDateField[] = IMPORT_DATE_FIELDS.filter(
  (f) => f.key !== 'pre_alert_date',
);

/**
 * The clearance pipeline, as the three gates a file passes in order.
 *
 * Each step counts files that cleared every earlier gate and are waiting on this
 * one, so the three counts are disjoint and a file appears in exactly one — the
 * figure an operator can act on. (Counting "missing quittance" on its own would
 * include files that have not even been declared yet.)
 */
export const IMPORT_PIPELINE_STEPS = [
  {
    key: 'declaration_missing',
    label: 'Declaration Missing',
    hint: 'no DGDA In date',
    /** Must be present to have reached this gate. */
    after: [] as readonly string[],
    missing: 'dgda_in_date',
  },
  {
    key: 'liquidation_missing',
    label: 'Liquidation Missing',
    hint: 'declared, not liquidated',
    after: ['dgda_in_date'],
    missing: 'liquidation_date',
  },
  {
    key: 'quittance_missing',
    label: 'Quittance Missing',
    hint: 'liquidated, no quittance',
    after: ['dgda_in_date', 'liquidation_date'],
    missing: 'quittance_date',
  },
] as const;

export type ImportPipelineKey = (typeof IMPORT_PIPELINE_STEPS)[number]['key'];

export const IMPORT_PIPELINE_KEYS: readonly ImportPipelineKey[] = IMPORT_PIPELINE_STEPS.map(
  (s) => s.key,
);
