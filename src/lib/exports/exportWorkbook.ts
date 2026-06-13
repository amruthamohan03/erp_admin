// Shared column set + grouped-sheet builder for the Export Excel downloads
// (export-by-license, export-by-client). One definition keeps the two grouped
// exports identical except for the grouping key. Dates render dd-mm-yyyy and
// amount/weight columns are emitted as real numbers so Excel can total them.
import { type XlsxColumn, type XlsxSheet } from '@/lib/xlsx';
import type { ExportRichRow } from '@/db/queries/exports';

const DATE_KEYS = new Set<string>([
  'loading_date', 'pv_date', 'bp_date', 'demande_attestation_date', 'assay_date',
  'ceec_in_date', 'ceec_out_date', 'min_div_in_date', 'min_div_out_date',
  'segues_payment_date', 'dgda_in_date', 'liquidation_date', 'quittance_date',
  'dgda_out_date', 'gov_docs_in_date', 'gov_docs_out_date', 'dispatch_deliver_date',
  'kanyaka_arrival_date', 'kanyaka_departure_date', 'border_arrival_date',
  'exit_drc_date', 'end_of_formalities_date', 'loading_to_dispatch_date',
  'lmc_date', 'ogefrem_date', 'audited_date', 'archived_date',
]);

const NUM_KEYS = new Set<string>([
  'weight', 'fob', 'ceec_amount', 'cgea_amount', 'occ_amount', 'lmc_amount',
  'ogefrem_amount', 'liquidation_amount',
]);

export const EXPORT_EXCEL_COLUMNS: XlsxColumn[] = [
  { key: 'sno', header: '#', width: 6 },
  { key: 'mca_ref', header: 'MCA Reference', width: 26 },
  { key: 'client_name', header: 'Client', width: 18 },
  { key: 'license_number', header: 'License Number', width: 22 },
  { key: 'kind_name', header: 'Kind', width: 14 },
  { key: 'type_of_goods', header: 'Type of Goods', width: 16 },
  { key: 'transport_mode_name', header: 'Transport Mode', width: 16 },
  { key: 'currency', header: 'Currency', width: 10 },
  { key: 'buyer', header: 'Buyer', width: 18 },
  { key: 'regime_name', header: 'Regime', width: 14 },
  { key: 'clearance_name', header: 'Clearance Type', width: 16 },
  { key: 'invoice', header: 'Invoice', width: 16 },
  { key: 'po_ref', header: 'PO Reference', width: 16 },
  { key: 'bp_no', header: 'BP Number', width: 12 },
  { key: 'weight', header: 'Weight (MT)', width: 14 },
  { key: 'fob', header: 'FOB', width: 14 },
  { key: 'horse', header: 'Horse', width: 12 },
  { key: 'trailer_1', header: 'Trailer 1', width: 12 },
  { key: 'trailer_2', header: 'Trailer 2', width: 12 },
  { key: 'feet_container_size', header: 'Feet Container', width: 14 },
  { key: 'wagon_ref', header: 'Wagon Reference', width: 16 },
  { key: 'container', header: 'Container', width: 14 },
  { key: 'transporter', header: 'Transporter', width: 18 },
  { key: 'loading_site', header: 'Site of Loading', width: 18 },
  { key: 'destination', header: 'Destination', width: 18 },
  { key: 'exit_point', header: 'Exit Point', width: 16 },
  { key: 'loading_date', header: 'Loading Date', width: 14 },
  { key: 'pv_date', header: 'PV Date', width: 14 },
  { key: 'bp_date', header: 'BP Date', width: 14 },
  { key: 'lot_number', header: 'Lot Number', width: 14 },
  { key: 'dgda_seal_no', header: 'DGDA Seal No', width: 18 },
  { key: 'number_of_seals', header: 'No. of Seals', width: 12 },
  { key: 'number_of_bags', header: 'No. of Bags', width: 12 },
  { key: 'ceec_amount', header: 'CEEC (USD)', width: 12 },
  { key: 'cgea_amount', header: 'CGEA (USD)', width: 12 },
  { key: 'occ_amount', header: 'OCC (USD)', width: 12 },
  { key: 'lmc_amount', header: 'LMC (USD)', width: 12 },
  { key: 'ogefrem_amount', header: 'OGEFREM (USD)', width: 14 },
  { key: 'ceec_in_date', header: 'CEEC In', width: 14 },
  { key: 'ceec_out_date', header: 'CEEC Out', width: 14 },
  { key: 'min_div_in_date', header: 'Min Div In', width: 14 },
  { key: 'min_div_out_date', header: 'Min Div Out', width: 14 },
  { key: 'document_status_name', header: 'Document Status', width: 16 },
  { key: 'customs_clearing_code', header: 'Customs Clearing Code', width: 18 },
  { key: 'dgda_in_date', header: 'DGDA In Date', width: 14 },
  { key: 'declaration_reference', header: 'Declaration Reference', width: 18 },
  { key: 'liquidation_reference', header: 'Liquidation Reference', width: 18 },
  { key: 'liquidation_date', header: 'Liquidation Date', width: 14 },
  { key: 'liquidation_paid_by', header: 'Liquidation Paid By', width: 16 },
  { key: 'liquidation_amount', header: 'Liquidation Amount', width: 16 },
  { key: 'quittance_reference', header: 'Quittance Reference', width: 18 },
  { key: 'quittance_date', header: 'Quittance Date', width: 14 },
  { key: 'dgda_out_date', header: 'DGDA Out Date', width: 14 },
  { key: 'gov_docs_in_date', header: 'Gov Docs In', width: 14 },
  { key: 'gov_docs_out_date', header: 'Gov Docs Out', width: 14 },
  { key: 'dispatch_deliver_date', header: 'Dispatch/Deliver', width: 16 },
  { key: 'exit_drc_date', header: 'Exit DRC Date', width: 14 },
  { key: 'end_of_formalities_date', header: 'End of Formalities', width: 16 },
  { key: 'truck_status_name', header: 'Truck Status', width: 16 },
  { key: 'clearing_status_name', header: 'Clearing Status', width: 18 },
  { key: 'lmc_id', header: 'LMC ID', width: 14 },
  { key: 'ogefrem_inv_ref', header: 'OGEFREM Inv.Ref.', width: 16 },
  { key: 'lmc_date', header: 'LMC Date', width: 14 },
  { key: 'ogefrem_date', header: 'OGEFREM Date', width: 14 },
  { key: 'audited_date', header: 'Audited Date', width: 14 },
  { key: 'archived_date', header: 'Archived Date', width: 14 },
];

function fmtDate(v: unknown): string {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}-${m}-${y}` : s;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function mapRow(r: ExportRichRow, idx: number): Record<string, unknown> {
  const o: Record<string, unknown> = { sno: idx + 1 };
  const rec = r as Record<string, unknown>;
  for (const col of EXPORT_EXCEL_COLUMNS) {
    if (col.key === 'sno') continue;
    const v = rec[col.key];
    if (DATE_KEYS.has(col.key)) o[col.key] = fmtDate(v);
    else if (NUM_KEYS.has(col.key)) o[col.key] = toNum(v);
    else o[col.key] = v ?? '';
  }
  return o;
}

/** Group rich export rows into one Excel sheet per license/client, with totals. */
export function buildGroupedExportSheets(
  rows: ExportRichRow[],
  groupBy: 'license_number' | 'client_name',
): XlsxSheet[] {
  const fallback = groupBy === 'license_number' ? 'No License' : 'No Client';
  const groups = new Map<string, ExportRichRow[]>();
  for (const r of rows) {
    const key = ((r as Record<string, unknown>)[groupBy] as string) || fallback;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const sheets: XlsxSheet[] = [];
  for (const [name, grp] of groups) {
    const totalWeight = grp.reduce((a, r) => a + (toNum(r.weight) ?? 0), 0);
    const totalFob = grp.reduce((a, r) => a + (toNum(r.fob) ?? 0), 0);
    sheets.push({
      name,
      columns: EXPORT_EXCEL_COLUMNS,
      rows: grp.map((r, i) => mapRow(r, i)),
      totalsRow: {
        mca_ref: `TOTAL (${grp.length} records)`,
        weight: Number(totalWeight.toFixed(3)),
        fob: Number(totalFob.toFixed(2)),
      },
    });
  }
  return sheets;
}
