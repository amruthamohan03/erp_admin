import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT } from '@/db/schema';
import { exportReportFilter } from './exportDashboardTabs';
import { EXPORT_REPORT_KEYS, type ExportReportKey } from '@/lib/tracking/exportDateFields';
import type { XlsxColumn, XlsxSheet } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';

// The five reports the Export dashboard's Report tab issues, plus the custom
// export behind it.
//
// Main wrote these as five export methods of 150 lines each, every one
// rebuilding its own 50-line SELECT with the same nine LEFT JOINs — and the
// CEEC and Dispatch reports were byte-identical apart from which date column
// they filtered on. Here there is ONE row shape with every field any report
// needs, and a report is a list of columns over it (§4.10). Adding a column to
// the shared catalogue makes it available to all five.
//
// Dates are rendered through `formatDate`, so a spreadsheet that leaves the
// office carries DD-MM-YYYY like every other surface (§4.19).

/** Rows from `db.execute`, which is untyped at the boundary. */
function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

type Row = Record<string, unknown>;

const d = (v: unknown): string => formatDate(v as string | null, '');
const n = (v: unknown): number => Number(v ?? 0);
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Every field any of the five reports selects, from one query.
 *
 * `net_days_excl_weekends` reproduces main's formula exactly — five days per
 * whole week plus the remainder capped at five. It is an approximation that
 * ignores which weekday the span starts on, but it is the number this operation
 * already reads on these sheets, so it is reproduced rather than corrected; the
 * holiday-aware counter behind the delay KPI is the one to switch to if that
 * figure should change.
 */
const REPORT_SELECT = sql`
  SELECT ${exportT.id} AS id,
         ${exportT.mcaRef} AS mca_ref,
         ${exportT.invoice} AS invoice,
         ${exportT.lotNumber} AS lot_number,
         ${exportT.buyer} AS buyer,
         c.short_name AS client_name,
         l.license_number AS license_number,
         l.license_expiry_date AS license_expiry,
         k.kind_name AS kind_name,
         tm.transport_mode_name AS transport_mode,
         tg.goods_type AS goods_type,
         cur.currency_name AS currency_name,
         tp.transit_point_name AS loading_site,
         cs.clearing_status AS clearing_status,
         ds.document_status AS document_status,
         -- A wagon reference when there is one, else the horse and trailer:
         -- the sheets have one "Truck/Wagon" column for both kinds of haulage.
         CASE
           WHEN ${exportT.wagonRef} IS NOT NULL AND ${exportT.wagonRef} <> '' THEN ${exportT.wagonRef}
           ELSE NULLIF(concat_ws(' / ', NULLIF(${exportT.horse}, ''), NULLIF(${exportT.trailer1}, '')), '')
         END AS truck_wagon,
         ${exportT.horse} AS horse,
         ${exportT.trailer1} AS trailer_1,
         ${exportT.trailer2} AS trailer_2,
         ${exportT.container} AS container,
         ${exportT.wagonRef} AS wagon_ref,
         ${exportT.weight}::float AS weight,
         ${exportT.fob}::float AS fob,
         ${exportT.numberOfSeals} AS number_of_seals,
         ${exportT.numberOfBags} AS number_of_bags,
         COALESCE(${exportT.ceecAmount}, 0)::float AS ceec_amount,
         COALESCE(${exportT.cgeaAmount}, 0)::float AS cgea_amount,
         COALESCE(${exportT.occAmount}, 0)::float AS occ_amount,
         COALESCE(${exportT.lmcAmount}, 0)::float AS lmc_amount,
         COALESCE(${exportT.ogefremAmount}, 0)::float AS ogefrem_amount,
         (COALESCE(${exportT.ceecAmount}, 0) + COALESCE(${exportT.cgeaAmount}, 0)
          + COALESCE(${exportT.occAmount}, 0) + COALESCE(${exportT.lmcAmount}, 0)
          + COALESCE(${exportT.ogefremAmount}, 0))::float AS total_agency_fees,
         COALESCE(${exportT.liquidationAmount}, 0)::float AS liquidation_amount,
         ${exportT.lmcId} AS lmc_id,
         ${exportT.ogefremInvRef} AS ogefrem_inv_ref,
         ${exportT.declarationReference} AS declaration_reference,
         ${exportT.liquidationReference} AS liquidation_reference,
         ${exportT.quittanceReference} AS quittance_reference,
         ${exportT.loadingDate} AS loading_date,
         ${exportT.pvDate} AS pv_date,
         ${exportT.bpDate} AS bp_date,
         ${exportT.demandeAttestationDate} AS demande_attestation_date,
         ${exportT.assayDate} AS assay_date,
         ${exportT.ceecInDate} AS ceec_in_date,
         ${exportT.ceecOutDate} AS ceec_out_date,
         ${exportT.minDivInDate} AS min_div_in_date,
         ${exportT.minDivOutDate} AS min_div_out_date,
         ${exportT.seguesPaymentDate} AS segues_payment_date,
         ${exportT.dgdaInDate} AS dgda_in_date,
         ${exportT.liquidationDate} AS liquidation_date,
         ${exportT.quittanceDate} AS quittance_date,
         ${exportT.dgdaOutDate} AS dgda_out_date,
         ${exportT.govDocsInDate} AS gov_docs_in_date,
         ${exportT.govDocsOutDate} AS gov_docs_out_date,
         ${exportT.dispatchDeliverDate} AS dispatch_deliver_date,
         ${exportT.loadingToDispatchDate} AS loading_to_dispatch_date,
         ${exportT.kanyakaArrivalDate} AS kanyaka_arrival_date,
         ${exportT.kanyakaDepartureDate} AS kanyaka_departure_date,
         ${exportT.borderArrivalDate} AS border_arrival_date,
         ${exportT.exitDrcDate} AS exit_drc_date,
         ${exportT.endOfFormalitiesDate} AS end_of_formalities_date,
         ${exportT.lmcDate} AS lmc_date,
         ${exportT.ogefremDate} AS ogefrem_date,
         ${exportT.auditedDate} AS audited_date,
         ${exportT.archivedDate} AS archived_date,
         to_char(${exportT.createdAt}, 'YYYY-MM-DD') AS created_at,
         ${exportT.remarks} AS remarks,
         CASE WHEN ${exportT.loadingDate} IS NOT NULL THEN
           5 * ((COALESCE(${exportT.exitDrcDate}, current_date) - ${exportT.loadingDate}) / 7)
           + LEAST((COALESCE(${exportT.exitDrcDate}, current_date) - ${exportT.loadingDate}) % 7, 5)
         END AS net_days_excl_weekends
    FROM ${exportT}
    LEFT JOIN client_master_t c ON c.id = ${exportT.clientId}
    LEFT JOIN license_t l ON l.id = ${exportT.licenseId}
    LEFT JOIN kind_master_t k ON k.id = ${exportT.kind}
    LEFT JOIN transport_mode_master_t tm ON tm.id = ${exportT.transportMode}
    LEFT JOIN type_of_goods_master_t tg ON tg.id = ${exportT.typeOfGoods}
    LEFT JOIN currency_master_t cur ON cur.id = ${exportT.currency}
    LEFT JOIN transit_point_master_t tp ON tp.id = ${exportT.siteOfLoadingId}
    LEFT JOIN clearing_status_master_t cs ON cs.id = ${exportT.clearingStatus}
    LEFT JOIN document_status_master_t ds ON ds.id = ${exportT.documentStatus}`;

/** A column over the shared row, with the cell it renders. */
interface ReportColumn extends XlsxColumn {
  value: (r: Row, index: number) => unknown;
}

const seq: ReportColumn = { key: 'seq', header: '#', width: 6, value: (_r, i) => i + 1 };

/**
 * The clearance-trail columns the CEEC and Dispatch sheets share.
 *
 * Those two reports were byte-identical in main apart from the date they filter
 * on, which is why this is one list rather than two.
 */
const CLEARANCE_TRAIL: ReportColumn[] = [
  seq,
  { key: 'client_name', header: 'Client', width: 18, value: (r) => s(r.client_name) },
  { key: 'goods_type', header: 'Product', width: 18, value: (r) => s(r.goods_type) },
  { key: 'transport_mode', header: 'Mode of Transport', width: 16, value: (r) => s(r.transport_mode) },
  { key: 'mca_ref', header: 'Ref.Dossier', width: 20, value: (r) => s(r.mca_ref) },
  { key: 'lot_number', header: 'Lot Num', width: 14, value: (r) => s(r.lot_number) },
  { key: 'license_number', header: 'License Num', width: 18, value: (r) => s(r.license_number) },
  { key: 'license_expiry', header: 'Date Of Expiration', width: 16, value: (r) => d(r.license_expiry) },
  { key: 'weight', header: 'Weight', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.weight) },
  { key: 'loading_date', header: 'Loading Date', width: 14, value: (r) => d(r.loading_date) },
  { key: 'bp_date', header: 'BP Details Received Date', width: 18, value: (r) => d(r.bp_date) },
  { key: 'pv_date', header: 'PV Div Mines', width: 14, value: (r) => d(r.pv_date) },
  { key: 'demande_attestation_date', header: "Demande d'Attestation", width: 18, value: (r) => d(r.demande_attestation_date) },
  { key: 'assay_date', header: 'Assay Date', width: 14, value: (r) => d(r.assay_date) },
  { key: 'ceec_in_date', header: 'CEEC In', width: 14, value: (r) => d(r.ceec_in_date) },
  { key: 'ceec_out_date', header: 'CEEC Out', width: 14, value: (r) => d(r.ceec_out_date) },
  { key: 'min_div_in_date', header: 'Min Div In', width: 14, value: (r) => d(r.min_div_in_date) },
  { key: 'min_div_out_date', header: 'Min Div Out', width: 14, value: (r) => d(r.min_div_out_date) },
  { key: 'declaration_date', header: 'Declaration Date', width: 16, value: (r) => d(r.dgda_in_date) },
  { key: 'dgda_in_date', header: 'DGDA In Date', width: 14, value: (r) => d(r.dgda_in_date) },
  { key: 'liquidation_reference', header: 'Liquidation Reference', width: 18, value: (r) => s(r.liquidation_reference) },
  { key: 'liquidation_date', header: 'Date Liquidation', width: 16, value: (r) => d(r.liquidation_date) },
  { key: 'quittance_date', header: 'Date Quittance', width: 16, value: (r) => d(r.quittance_date) },
  { key: 'dgda_out_date', header: 'DGDA Out Date / BS Date', width: 18, value: (r) => d(r.dgda_out_date) },
  { key: 'gov_docs_in_date', header: 'Gov Docs In', width: 14, value: (r) => d(r.gov_docs_in_date) },
  { key: 'gov_docs_out_date', header: 'Gov Docs Out', width: 14, value: (r) => d(r.gov_docs_out_date) },
  { key: 'dispatch_deliver_date', header: 'Disp_Date / BS_Date', width: 16, value: (r) => d(r.dispatch_deliver_date) },
  { key: 'loading_to_dispatch_date', header: 'Dispatch IMPALA-SNCC', width: 18, value: (r) => d(r.loading_to_dispatch_date) },
  { key: 'kanyaka_departure_date', header: 'Dispatch Date SNCC-SAKANIA', width: 20, value: (r) => d(r.kanyaka_departure_date) },
  { key: 'kanyaka_arrival_date', header: 'SAKANIA Arrival Date', width: 18, value: (r) => d(r.kanyaka_arrival_date) },
  { key: 'border_arrival_date', header: 'Border Arrival Date', width: 16, value: (r) => d(r.border_arrival_date) },
  { key: 'exit_drc_date', header: 'Exit DRC Date', width: 14, value: (r) => d(r.exit_drc_date) },
  { key: 'clearing_status', header: 'CLEARING STATUS', width: 18, value: (r) => s(r.clearing_status) },
  { key: 'document_status', header: 'STATUS', width: 18, value: (r) => s(r.document_status) },
  { key: 'remarks', header: 'REMARKS', width: 28, value: (r) => remarksText(r.remarks) },
  {
    key: 'net_days_excl_weekends',
    header: 'NET DAYS EXCL WEEKENDS',
    width: 16,
    align: 'right',
    value: (r) => (r.net_days_excl_weekends === null ? '' : n(r.net_days_excl_weekends)),
  },
];

/** The dated remarks log, flattened to one cell (§4.5, §4.19). */
function remarksText(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';
  return (raw as Array<{ date?: string; remark?: string }>)
    .map((r) => [r.date ? formatDate(r.date) : '', r.remark].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' | ');
}

/** An agency's own sheet: who, what moved it, and what was charged. */
function agencySheet(opts: {
  invoiceRefKey: string;
  invoiceRefHeader: string;
  amountKey: string;
  amountHeader: string;
  /** OGEFREM lists the product before the rubrique; LMC lists it after. */
  productFirst: boolean;
}): ReportColumn[] {
  const product: ReportColumn = {
    key: 'goods_type',
    header: 'Product',
    width: 18,
    value: (r) => s(r.goods_type),
  };
  const rubriques: ReportColumn = {
    key: 'kind_name',
    header: 'RUBRIQUES (Category)',
    width: 20,
    value: (r) => s(r.kind_name),
  };
  const head: ReportColumn[] = [
    seq,
    { key: 'mca_ref', header: 'Ref.Dossier', width: 20, value: (r) => s(r.mca_ref) },
    { key: 'client_name', header: 'Client', width: 18, value: (r) => s(r.client_name) },
    { key: 'transport_mode', header: 'Mode of Transport', width: 16, value: (r) => s(r.transport_mode) },
  ];
  if (opts.productFirst) head.push(product);
  return [
    ...head,
    { key: 'truck_wagon', header: 'Truck/Wagon', width: 20, value: (r) => s(r.truck_wagon) },
    { key: 'loading_date', header: 'Loading Date', width: 14, value: (r) => d(r.loading_date) },
    { key: opts.invoiceRefKey, header: opts.invoiceRefHeader, width: 18, value: (r) => s(r[opts.invoiceRefKey]) },
    { key: 'invoice', header: 'Client Invoiced #', width: 16, value: (r) => s(r.invoice) },
    { key: 'created_at', header: 'Client Invoiced Date', width: 16, value: (r) => d(r.created_at) },
    { key: 'weight', header: 'Qty', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.weight) },
    ...(opts.productFirst ? [rubriques] : [product]),
    // Held on the agency's own paperwork rather than in the file, so the
    // columns are present and blank rather than silently dropped.
    { key: 'unite', header: 'UNITE (Unit_of_Measurements)', width: 20, value: () => '' },
    { key: 'tax_unitaire', header: 'TAX_UNITAIRE (Unit_Rate)', width: 20, value: () => '' },
    {
      key: opts.amountKey,
      header: opts.amountHeader,
      width: 16,
      align: 'right',
      numFmt: '#,##0.00',
      value: (r) => n(r[opts.amountKey]),
    },
  ];
}

export interface ExportReportDef {
  key: ExportReportKey;
  title: string;
  /** Sheet and file name stem. */
  filename: string;
  /** The date column its range filters on, as the card's caption states. */
  dateField: string;
  columns: ReportColumn[];
  /** Columns to total in a GRAND TOTAL row, by key. */
  totals: string[];
  orderBy: SQL;
}

/**
 * Keyed by report, not a list, so TypeScript proves the registry covers every
 * key `EXPORT_REPORT_KEYS` declares. The two have to live apart — the keys are
 * in a pure module because the boundary schema is parsed in the browser too,
 * and importing this file there would pull the pg driver into the bundle — and
 * a `Record` over the union is what keeps them in step without a runtime check.
 */
const REGISTRY: Record<ExportReportKey, ExportReportDef> = {
  ogefrem: {
    key: 'ogefrem',
    title: 'OGEFREM Report',
    filename: 'export-ogefrem',
    dateField: 'loading_date',
    columns: agencySheet({
      invoiceRefKey: 'ogefrem_inv_ref',
      invoiceRefHeader: 'OGEFREM Invoice #',
      amountKey: 'ogefrem_amount',
      amountHeader: 'OGEFREM Amount',
      productFirst: true,
    }),
    totals: ['weight', 'ogefrem_amount'],
    orderBy: sql`${exportT.loadingDate} DESC NULLS LAST`,
  },
  lmc: {
    key: 'lmc',
    title: 'LMC Report',
    filename: 'export-lmc',
    dateField: 'loading_date',
    columns: agencySheet({
      invoiceRefKey: 'lmc_id',
      invoiceRefHeader: 'LMC Invoice #',
      amountKey: 'lmc_amount',
      amountHeader: 'LMC Amount',
      productFirst: false,
    }),
    totals: ['weight', 'lmc_amount'],
    orderBy: sql`${exportT.loadingDate} DESC NULLS LAST`,
  },
  ceec: {
    key: 'ceec',
    title: 'CEEC & CEEG Report',
    filename: 'export-ceec-ceeg',
    dateField: 'loading_date',
    columns: CLEARANCE_TRAIL,
    totals: ['weight'],
    orderBy: sql`${exportT.loadingDate} DESC NULLS LAST`,
  },
  quittance: {
    key: 'quittance',
    title: 'Quittance Payment Report',
    filename: 'export-quittance',
    dateField: 'quittance_date',
    columns: [
      seq,
      { key: 'client_name', header: 'Client', width: 18, value: (r) => s(r.client_name) },
      { key: 'kind_name', header: 'Category', width: 18, value: (r) => s(r.kind_name) },
      { key: 'transport_mode', header: 'Mode of Transport', width: 16, value: (r) => s(r.transport_mode) },
      { key: 'mca_ref', header: 'Ref.Dossier', width: 20, value: (r) => s(r.mca_ref) },
      { key: 'lot_number', header: 'Lot Num', width: 14, value: (r) => s(r.lot_number) },
      { key: 'invoice', header: 'Ref.Fact.', width: 16, value: (r) => s(r.invoice) },
      { key: 'license_number', header: 'License Num', width: 18, value: (r) => s(r.license_number) },
      { key: 'declaration_reference', header: 'Declaration Ref.', width: 18, value: (r) => s(r.declaration_reference) },
      { key: 'declaration_date', header: 'Declaration Date', width: 16, value: (r) => d(r.dgda_in_date) },
      { key: 'liquidation_reference', header: 'Liquidation Ref.', width: 18, value: (r) => s(r.liquidation_reference) },
      { key: 'liquidation_date', header: 'Liquidation Date', width: 16, value: (r) => d(r.liquidation_date) },
      {
        key: 'liquidation_amount',
        header: 'Liquidation Amount',
        width: 18,
        align: 'right',
        numFmt: '#,##0.00',
        value: (r) => n(r.liquidation_amount),
      },
      { key: 'quittance_reference', header: 'Quittance Ref.', width: 18, value: (r) => s(r.quittance_reference) },
      { key: 'quittance_date', header: 'Quittance Date', width: 16, value: (r) => d(r.quittance_date) },
    ],
    totals: ['liquidation_amount'],
    orderBy: sql`${exportT.quittanceDate} DESC NULLS LAST`,
  },
  dispatch: {
    key: 'dispatch',
    title: 'Dispatch Report',
    filename: 'export-dispatch',
    dateField: 'dispatch_deliver_date',
    // The same trail as CEEC — in main these were two identical 150-line
    // methods differing only in the date they filter on.
    columns: CLEARANCE_TRAIL,
    totals: ['weight'],
    orderBy: sql`${exportT.dispatchDeliverDate} DESC NULLS LAST`,
  },
};

/** The registry in the order the Report tab lists its cards. */
export const EXPORT_REPORTS: readonly ExportReportDef[] = EXPORT_REPORT_KEYS.map(
  (k) => REGISTRY[k],
);

export function exportReport(key: string): ExportReportDef | undefined {
  return (REGISTRY as Record<string, ExportReportDef | undefined>)[key];
}

/** Build one report as a sheet, with its GRAND TOTAL row. */
export async function buildExportReportSheet(
  def: ExportReportDef,
  filters: { client_id?: number | undefined; from?: string | undefined; to?: string | undefined },
): Promise<XlsxSheet> {
  const where = exportReportFilter({ ...filters, field: def.dateField });
  const rows = rowsOf<Row>(
    await db.execute(sql`${REPORT_SELECT} WHERE ${where} ORDER BY ${def.orderBy} LIMIT 10000`),
  );

  const out = rows.map((r, i) => {
    const cell: Record<string, unknown> = {};
    for (const c of def.columns) cell[c.key] = c.value(r, i);
    return cell;
  });

  if (out.length > 0 && def.totals.length > 0) {
    const total: Record<string, unknown> = {};
    const first = def.columns[0];
    total[first.key] = `GRAND TOTAL (${out.length} record${out.length === 1 ? '' : 's'})`;
    for (const key of def.totals) {
      total[key] = out.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
    }
    out.push(total);
  }

  return {
    name: def.title.slice(0, 31),
    columns: def.columns.map(({ key, header, width, align, numFmt }) => ({
      key,
      header,
      width,
      align,
      numFmt,
    })),
    rows: out,
    borders: true,
  };
}

/**
 * The custom export: every tracked field, for files whose chosen date falls in
 * the range. This is main's `exportByDateField`, which listed 56 columns by
 * hand — here it is the clearance trail plus the commercial and haulage
 * columns, assembled from the same catalogue.
 */
export const EXPORT_CUSTOM_COLUMNS: ReportColumn[] = [
  seq,
  { key: 'mca_ref', header: 'MCA Ref', width: 20, value: (r) => s(r.mca_ref) },
  { key: 'invoice', header: 'Invoice', width: 16, value: (r) => s(r.invoice) },
  { key: 'client_name', header: 'Client', width: 18, value: (r) => s(r.client_name) },
  { key: 'buyer', header: 'Buyer', width: 20, value: (r) => s(r.buyer) },
  { key: 'license_number', header: 'License', width: 18, value: (r) => s(r.license_number) },
  { key: 'kind_name', header: 'Kind', width: 16, value: (r) => s(r.kind_name) },
  { key: 'transport_mode', header: 'Transport Mode', width: 16, value: (r) => s(r.transport_mode) },
  { key: 'goods_type', header: 'Goods Type', width: 16, value: (r) => s(r.goods_type) },
  { key: 'weight', header: 'Weight', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.weight) },
  { key: 'fob', header: 'FOB', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.fob) },
  { key: 'currency_name', header: 'Currency', width: 12, value: (r) => s(r.currency_name) },
  { key: 'ceec_amount', header: 'CEEC', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.ceec_amount) },
  { key: 'cgea_amount', header: 'CGEA', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.cgea_amount) },
  { key: 'occ_amount', header: 'OCC', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.occ_amount) },
  { key: 'lmc_amount', header: 'LMC', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.lmc_amount) },
  { key: 'lmc_id', header: 'LMC ID', width: 14, value: (r) => s(r.lmc_id) },
  { key: 'lmc_date', header: 'LMC Date', width: 14, value: (r) => d(r.lmc_date) },
  { key: 'ogefrem_amount', header: 'OGEFREM', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.ogefrem_amount) },
  { key: 'ogefrem_inv_ref', header: 'OGEFREM Ref', width: 16, value: (r) => s(r.ogefrem_inv_ref) },
  { key: 'ogefrem_date', header: 'OGEFREM Date', width: 14, value: (r) => d(r.ogefrem_date) },
  { key: 'total_agency_fees', header: 'Total Agency Fees', width: 18, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.total_agency_fees) },
  { key: 'liquidation_amount', header: 'Liquidation', width: 14, align: 'right', numFmt: '#,##0.00', value: (r) => n(r.liquidation_amount) },
  { key: 'liquidation_date', header: 'Liquidation Date', width: 16, value: (r) => d(r.liquidation_date) },
  { key: 'liquidation_reference', header: 'Liquidation Ref', width: 18, value: (r) => s(r.liquidation_reference) },
  { key: 'quittance_date', header: 'Quittance Date', width: 16, value: (r) => d(r.quittance_date) },
  { key: 'quittance_reference', header: 'Quittance Ref', width: 18, value: (r) => s(r.quittance_reference) },
  { key: 'declaration_reference', header: 'Declaration Reference', width: 18, value: (r) => s(r.declaration_reference) },
  { key: 'declaration_date', header: 'Declaration Date', width: 16, value: (r) => d(r.dgda_in_date) },
  { key: 'clearing_status', header: 'Clearing Status', width: 18, value: (r) => s(r.clearing_status) },
  { key: 'document_status', header: 'Document Status', width: 18, value: (r) => s(r.document_status) },
  { key: 'loading_site', header: 'Loading Site', width: 18, value: (r) => s(r.loading_site) },
  { key: 'loading_date', header: 'Loading Date', width: 14, value: (r) => d(r.loading_date) },
  { key: 'exit_drc_date', header: 'Exit Date', width: 14, value: (r) => d(r.exit_drc_date) },
  { key: 'ceec_in_date', header: 'CEEC In', width: 14, value: (r) => d(r.ceec_in_date) },
  { key: 'ceec_out_date', header: 'CEEC Out', width: 14, value: (r) => d(r.ceec_out_date) },
  { key: 'min_div_in_date', header: 'MinDiv In', width: 14, value: (r) => d(r.min_div_in_date) },
  { key: 'min_div_out_date', header: 'MinDiv Out', width: 14, value: (r) => d(r.min_div_out_date) },
  { key: 'dgda_out_date', header: 'DGDA Out', width: 14, value: (r) => d(r.dgda_out_date) },
  { key: 'border_arrival_date', header: 'Border Arrival', width: 16, value: (r) => d(r.border_arrival_date) },
  { key: 'kanyaka_arrival_date', header: 'Kanyaka Arrival', width: 16, value: (r) => d(r.kanyaka_arrival_date) },
  { key: 'kanyaka_departure_date', header: 'Kanyaka Departure', width: 18, value: (r) => d(r.kanyaka_departure_date) },
  { key: 'pv_date', header: 'PV Date', width: 14, value: (r) => d(r.pv_date) },
  { key: 'bp_date', header: 'BP Date', width: 14, value: (r) => d(r.bp_date) },
  { key: 'assay_date', header: 'Assay Date', width: 14, value: (r) => d(r.assay_date) },
  { key: 'number_of_seals', header: 'Seals', width: 10, align: 'right', value: (r) => n(r.number_of_seals) },
  { key: 'number_of_bags', header: 'Bags', width: 10, align: 'right', value: (r) => n(r.number_of_bags) },
  { key: 'horse', header: 'Horse', width: 14, value: (r) => s(r.horse) },
  { key: 'trailer_1', header: 'Trailer 1', width: 14, value: (r) => s(r.trailer_1) },
  { key: 'trailer_2', header: 'Trailer 2', width: 14, value: (r) => s(r.trailer_2) },
  { key: 'container', header: 'Container', width: 14, value: (r) => s(r.container) },
  { key: 'wagon_ref', header: 'Wagon', width: 14, value: (r) => s(r.wagon_ref) },
  { key: 'created_at', header: 'Created Date', width: 14, value: (r) => d(r.created_at) },
  { key: 'net_days_excl_weekends', header: 'Net Days Excl Weekends', width: 16, align: 'right', value: (r) => (r.net_days_excl_weekends === null ? '' : n(r.net_days_excl_weekends)) },
];

export async function buildExportCustomSheet(
  field: string,
  filters: { client_id?: number | undefined; from?: string | undefined; to?: string | undefined },
  title: string,
): Promise<XlsxSheet> {
  const where = exportReportFilter({ ...filters, field });
  const rows = rowsOf<Row>(
    await db.execute(
      sql`${REPORT_SELECT} WHERE ${where} ORDER BY ${sql.identifier(field)} DESC NULLS LAST LIMIT 10000`,
    ),
  );

  const out = rows.map((r, i) => {
    const cell: Record<string, unknown> = {};
    for (const c of EXPORT_CUSTOM_COLUMNS) cell[c.key] = c.value(r, i);
    return cell;
  });

  if (out.length > 0) {
    const total: Record<string, unknown> = {
      seq: `GRAND TOTAL (${out.length} record${out.length === 1 ? '' : 's'})`,
    };
    for (const key of ['weight', 'fob', 'total_agency_fees', 'liquidation_amount']) {
      total[key] = out.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
    }
    out.push(total);
  }

  return {
    name: title.slice(0, 31),
    columns: EXPORT_CUSTOM_COLUMNS.map(({ key, header, width, align, numFmt }) => ({
      key,
      header,
      width,
      align,
      numFmt,
    })),
    rows: out,
    borders: true,
  };
}
