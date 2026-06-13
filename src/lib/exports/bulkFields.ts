// Whitelist of exports_t columns that may be bulk-edited (select rows → set one
// field on all of them). Plain data so both the bulk API (server whitelist) and
// the /export page (UI control) share one definition. The bulk API additionally
// intersects these names with the real exports_t columns via safeColumnsFor.
// Mirrors the legacy ExportController::bulkUpdate allowed fields.
export type BulkFieldType = 'select' | 'date' | 'text';

export interface BulkField {
  /** Real column name on exports_t. */
  name: string;
  label: string;
  type: BulkFieldType;
  /** For type 'select': master endpoint slug + the label key in its rows. */
  optionsSource?: string;
  optionsLabel?: string;
}

export const BULK_FIELDS: BulkField[] = [
  { name: 'clearing_status', label: 'Clearing Status', type: 'select', optionsSource: 'clearing-statuses', optionsLabel: 'clearing_status' },
  { name: 'document_status', label: 'Document Status', type: 'select', optionsSource: 'document-statuses', optionsLabel: 'document_status' },
  { name: 'truck_status', label: 'Truck Status', type: 'select', optionsSource: 'truck-statuses', optionsLabel: 'truck_status' },
  { name: 'site_of_loading_id', label: 'Site of Loading', type: 'select', optionsSource: 'transit-points', optionsLabel: 'transit_point_name' },
  { name: 'exit_point_id', label: 'Exit Point', type: 'select', optionsSource: 'transit-points', optionsLabel: 'transit_point_name' },
  { name: 'feet_container', label: 'Feet Container', type: 'select', optionsSource: 'feet-containers', optionsLabel: 'feet_container_size' },
  { name: 'ceec_in_date', label: 'CEEC In Date', type: 'date' },
  { name: 'ceec_out_date', label: 'CEEC Out Date', type: 'date' },
  { name: 'min_div_in_date', label: 'Min Div In Date', type: 'date' },
  { name: 'min_div_out_date', label: 'Min Div Out Date', type: 'date' },
  { name: 'gov_docs_in_date', label: 'Gov Docs In Date', type: 'date' },
  { name: 'gov_docs_out_date', label: 'Gov Docs Out Date', type: 'date' },
  { name: 'pv_date', label: 'PV Date', type: 'date' },
  { name: 'demande_attestation_date', label: "Demande d'Attestation", type: 'date' },
  { name: 'assay_date', label: 'Assay Date', type: 'date' },
  { name: 'dgda_in_date', label: 'DGDA In Date', type: 'date' },
  { name: 'liquidation_date', label: 'Liquidation Date', type: 'date' },
  { name: 'quittance_date', label: 'Quittance Date', type: 'date' },
  { name: 'dispatch_deliver_date', label: 'Dispatch/Deliver Date', type: 'date' },
  { name: 'audited_date', label: 'Audited Date', type: 'date' },
  { name: 'archived_date', label: 'Archived Date', type: 'date' },
  { name: 'lmc_date', label: 'LMC Date', type: 'date' },
  { name: 'ogefrem_date', label: 'OGEFREM Date', type: 'date' },
  { name: 'dgda_seal_no', label: 'DGDA Seal No', type: 'text' },
  { name: 'number_of_seals', label: 'No. of Seals', type: 'text' },
  { name: 'lmc_id', label: 'LMC ID', type: 'text' },
  { name: 'ogefrem_inv_ref', label: 'OGEFREM Inv. Ref', type: 'text' },
];

export const BULK_FIELD_NAMES = BULK_FIELDS.map((f) => f.name);
