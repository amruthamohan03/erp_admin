// Whitelist of imports_t columns that may be bulk-edited (select rows → set one
// field on all of them). Plain data so both the bulk API (server whitelist) and
// the /import page (UI control) share one definition. The bulk API additionally
// intersects these names with the real imports_t columns via safeColumnsFor.
export type BulkFieldType = 'select' | 'date' | 'text';

export interface BulkField {
  /** Real column name on imports_t. */
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
  { name: 'entry_point_id', label: 'Entry Point', type: 'select', optionsSource: 'transit-points', optionsLabel: 'transit_point_name' },
  { name: 'border_warehouse_id', label: 'Border Warehouse', type: 'select', optionsSource: 'transit-points', optionsLabel: 'transit_point_name' },
  { name: 'bonded_warehouse_id', label: 'Bonded Warehouse', type: 'select', optionsSource: 'transit-points', optionsLabel: 'transit_point_name' },
  { name: 'truck_status', label: 'Truck Status', type: 'text' },
  { name: 'crf_received_date', label: 'CRF Received Date', type: 'date' },
  { name: 'ad_date', label: 'AD Date', type: 'date' },
  { name: 'insurance_date', label: 'Insurance Date', type: 'date' },
  { name: 'dgda_in_date', label: 'DGDA In Date', type: 'date' },
  { name: 'dgda_out_date', label: 'DGDA Out Date', type: 'date' },
  { name: 'audited_date', label: 'Audited Date', type: 'date' },
  { name: 'archived_date', label: 'Archived Date', type: 'date' },
  { name: 'liquidation_date', label: 'Liquidation Date', type: 'date' },
  { name: 'quittance_date', label: 'Quittance Date', type: 'date' },
  { name: 'dispatch_deliver_date', label: 'Dispatch/Deliver Date', type: 'date' },
];

export const BULK_FIELD_NAMES = BULK_FIELDS.map((f) => f.name);
