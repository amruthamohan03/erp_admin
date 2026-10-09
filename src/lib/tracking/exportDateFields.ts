// The dated milestones an export file collects, in the order they happen.
//
// ONE list (§4.10), mirroring `importDateFields.ts`. It drives the custom
// export's date-field picker, the per-field WHERE clauses and the report
// filters, which main kept as four separate hand-maintained copies — the
// controller alone repeated the same 28-entry `$allowedDateFields` array three
// times and the friendly-name map twice.
//
// `key` is the real column name on `exports_t`, which is what lets the queries
// address a field with `sql.identifier` rather than a column map that has to be
// kept in step with this list.

export interface ExportDateField {
  /** Column on `exports_t`. */
  key: string;
  /** Full label — dropdowns, cards, export headers. */
  label: string;
  /** Short label, where a column header must fit. */
  short: string;
}

export const EXPORT_DATE_FIELDS: readonly ExportDateField[] = [
  { key: 'created_at', label: 'Created Date', short: 'Created' },
  { key: 'loading_date', label: 'Loading Date', short: 'Loading' },
  { key: 'pv_date', label: 'PV Date', short: 'PV' },
  { key: 'bp_date', label: 'BP Date', short: 'BP' },
  { key: 'demande_attestation_date', label: 'Demande Attestation Date', short: 'Dem. Attest' },
  { key: 'assay_date', label: 'Assay Date', short: 'Assay' },
  { key: 'ceec_in_date', label: 'CEEC In Date', short: 'CEEC In' },
  { key: 'ceec_out_date', label: 'CEEC Out Date', short: 'CEEC Out' },
  { key: 'min_div_in_date', label: 'Min Div In Date', short: 'MinDiv In' },
  { key: 'min_div_out_date', label: 'Min Div Out Date', short: 'MinDiv Out' },
  { key: 'segues_payment_date', label: 'SEGUES Payment Date', short: 'Segues Pay' },
  { key: 'dgda_in_date', label: 'DGDA In Date', short: 'DGDA In' },
  { key: 'liquidation_date', label: 'Liquidation Date', short: 'Liquidation' },
  { key: 'quittance_date', label: 'Quittance Date', short: 'Quittance' },
  { key: 'dgda_out_date', label: 'DGDA Out Date', short: 'DGDA Out' },
  { key: 'gov_docs_in_date', label: 'Gov Docs In Date', short: 'Gov Docs In' },
  { key: 'gov_docs_out_date', label: 'Gov Docs Out Date', short: 'Gov Docs Out' },
  { key: 'dispatch_deliver_date', label: 'Dispatch Deliver Date', short: 'Dispatch' },
  { key: 'loading_to_dispatch_date', label: 'Loading to Dispatch Date', short: 'Load to Disp' },
  { key: 'kanyaka_arrival_date', label: 'Kanyaka Arrival Date', short: 'Kanyaka Arr' },
  { key: 'kanyaka_departure_date', label: 'Kanyaka Departure Date', short: 'Kanyaka Dep' },
  { key: 'border_arrival_date', label: 'Border Arrival Date', short: 'Border Arr' },
  { key: 'exit_drc_date', label: 'Exit DRC Date', short: 'Exit DRC' },
  { key: 'end_of_formalities_date', label: 'End of Formalities Date', short: 'End Formalities' },
  { key: 'lmc_date', label: 'LMC Date', short: 'LMC' },
  { key: 'ogefrem_date', label: 'OGEFREM Date', short: 'OGEFREM' },
  { key: 'audited_date', label: 'Audited Date', short: 'Audited' },
  { key: 'archived_date', label: 'Archived Date', short: 'Archived' },
] as const;

export const EXPORT_DATE_FIELD_KEYS: readonly string[] = EXPORT_DATE_FIELDS.map((f) => f.key);

export function isExportDateField(key: string): boolean {
  return EXPORT_DATE_FIELD_KEYS.includes(key);
}

export function exportDateField(key: string): ExportDateField | undefined {
  return EXPORT_DATE_FIELDS.find((f) => f.key === key);
}

/**
 * The road journey an export takes out of the DRC, as ordered milestones.
 *
 * A file is WAITING at milestone i when milestone i is empty and milestone i-1
 * is filled, so the counts are disjoint and the SQL is generated from this list
 * rather than written out eight times (`importDateFields.ts` does the same for
 * the inbound leg).
 */
export const EXPORT_MILESTONES = [
  { key: 'loading', label: 'Loading', column: 'loading_date' },
  { key: 'dispatch', label: 'Dispatch', column: 'dispatch_deliver_date' },
  { key: 'kanyaka_arrival', label: 'Kanyaka Arrival', column: 'kanyaka_arrival_date' },
  { key: 'kanyaka_departure', label: 'Kanyaka Departure', column: 'kanyaka_departure_date' },
  { key: 'border_arrival', label: 'Border Arrival', column: 'border_arrival_date' },
  { key: 'exit_drc', label: 'Exit DRC', column: 'exit_drc_date' },
] as const;

export const EXPORT_MILESTONE_KEYS: readonly string[] = EXPORT_MILESTONES.map((m) => m.key);

/** Leaving the DRC IS completing the journey. */
export const EXPORT_JOURNEY_END = EXPORT_MILESTONES[EXPORT_MILESTONES.length - 1];

/**
 * The agencies an export is cleared through, each with its fee column and the
 * in/out dates that bound its processing time.
 *
 * One list behind the fee totals, the per-agency analytics and the processing
 * times — main had those as three unrelated queries naming the same five
 * agencies, so adding a sixth meant finding all three.
 */
export const EXPORT_AGENCIES = [
  {
    key: 'ceec',
    label: 'CEEC',
    amount: 'ceec_amount',
    from: 'ceec_in_date',
    to: 'ceec_out_date',
    reference: 'cgea_doc_ref',
  },
  { key: 'cgea', label: 'CGEA', amount: 'cgea_amount', from: null, to: null, reference: 'cgea_doc_ref' },
  { key: 'occ', label: 'OCC', amount: 'occ_amount', from: null, to: null, reference: null },
  { key: 'lmc', label: 'LMC', amount: 'lmc_amount', from: null, to: null, reference: 'lmc_id' },
  {
    key: 'ogefrem',
    label: 'OGEFREM',
    amount: 'ogefrem_amount',
    from: null,
    to: null,
    reference: 'ogefrem_inv_ref',
  },
] as const;

export type ExportAgencyKey = (typeof EXPORT_AGENCIES)[number]['key'];

/** The spans the dashboard reports an average processing time for. */
export const EXPORT_PROCESSING_SPANS = [
  { key: 'ceec', label: 'CEEC', from: 'ceec_in_date', to: 'ceec_out_date' },
  { key: 'min_div', label: 'Min Div', from: 'min_div_in_date', to: 'min_div_out_date' },
  { key: 'dgda', label: 'DGDA', from: 'dgda_in_date', to: 'dgda_out_date' },
  { key: 'gov_docs', label: 'Gov Docs', from: 'gov_docs_in_date', to: 'gov_docs_out_date' },
] as const;

/** The milestone-to-milestone averages the Overview timeline panel shows. */
export const EXPORT_TIMELINE_SPANS = [
  { key: 'loading_to_pv', label: 'Loading to PV', from: 'loading_date', to: 'pv_date' },
  { key: 'loading_to_customs', label: 'Loading to Customs', from: 'loading_date', to: 'dgda_in_date' },
  { key: 'days_in_customs', label: 'Days in Customs', from: 'dgda_in_date', to: 'dgda_out_date' },
  { key: 'ceec_processing', label: 'CEEC Processing', from: 'ceec_in_date', to: 'ceec_out_date' },
  { key: 'mindiv_processing', label: 'Min Div Processing', from: 'min_div_in_date', to: 'min_div_out_date' },
  { key: 'to_liquidation', label: 'To Liquidation', from: 'dgda_out_date', to: 'liquidation_date' },
  {
    key: 'liquidation_to_quittance',
    label: 'Liquidation to Quittance',
    from: 'liquidation_date',
    to: 'quittance_date',
  },
  { key: 'customs_to_exit', label: 'Customs to Exit', from: 'dgda_out_date', to: 'exit_drc_date' },
  { key: 'total_cycle_time', label: 'Total Cycle Time', from: 'loading_date', to: 'exit_drc_date' },
] as const;

/** The transit legs the Logistics tab averages. */
export const EXPORT_TRANSIT_SPANS = [
  { key: 'to_kanyaka', label: 'Loading to Kanyaka', from: 'loading_date', to: 'kanyaka_arrival_date' },
  {
    key: 'kanyaka_to_border',
    label: 'Kanyaka to Border',
    from: 'kanyaka_departure_date',
    to: 'border_arrival_date',
  },
  { key: 'border_to_exit', label: 'Border to Exit', from: 'border_arrival_date', to: 'exit_drc_date' },
  { key: 'total_journey', label: 'Total Journey', from: 'loading_date', to: 'exit_drc_date' },
] as const;

/**
 * The reports the Report tab offers.
 *
 * Declared here, in a module with no database import, because the boundary
 * schema validates against this list and that schema is parsed on BOTH sides
 * (§4.23) — a client component importing it must not drag the `pg` driver into
 * the browser bundle. The registry that knows each report's columns and SQL
 * lives in `db/queries/exportDashboardReports.ts` and is checked against this
 * list by its own test.
 */
export const EXPORT_REPORT_KEYS = ['ogefrem', 'lmc', 'ceec', 'quittance', 'dispatch'] as const;

export type ExportReportKey = (typeof EXPORT_REPORT_KEYS)[number];
