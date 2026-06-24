import { z } from 'zod';

// Zod boundary schemas for the exports module (§2 step 3 — customs
// exports lifecycle). Same posture as `imports.ts` — every business
// field is optional + nullable to support partial-create flows;
// presence enforcement belongs in a workflow rule, not the boundary
// schema.

const intIdNullable = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional();

const intNullable = z.coerce.number().int().nullable().optional();

const decimalString = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return v;
    return typeof v === 'number' ? v.toString() : v;
  });

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be YYYY-MM-DD')
  .nullable()
  .optional();

const shortText = (max: number) =>
  z.string().max(max).nullable().optional();

export const exportBodySchema = z.object({
  // ── Documentation ──
  client_id: intIdNullable,
  license_id: intIdNullable,
  kind_id: intIdNullable,
  type_of_goods_id: intIdNullable,
  transport_mode_id: intIdNullable,
  mca_ref: shortText(100),
  currency_id: intIdNullable,
  buyer: shortText(255),
  regime_id: intIdNullable,
  types_of_clearance_id: intIdNullable,
  invoice: shortText(100),
  po_ref: shortText(100),
  bp_no: shortText(100),
  hscode_id: intIdNullable,
  incoterm_id: intIdNullable,

  // ── Weight & Financial ──
  weight: decimalString,
  fob: decimalString,
  number_of_bags: intNullable,
  lot_number: shortText(100),

  // ── Transport ──
  horse: shortText(50),
  trailer_1: shortText(50),
  trailer_2: shortText(50),
  feet_container_id: intIdNullable,
  wagon_ref: shortText(50),
  container: shortText(50),
  transporter: shortText(255),
  site_of_loading_id: intIdNullable,
  destination: shortText(255),
  exit_point_id: intIdNullable,

  // ── Seals ──
  dgda_seal_no: shortText(255),
  number_of_seals: intNullable,

  // ── Charge Amounts ──
  ceec_amount: decimalString,
  cgea_amount: decimalString,
  occ_amount: decimalString,
  lmc_amount: decimalString,
  ogefrem_amount: decimalString,

  // ── Loading / Documentation Dates ──
  loading_date: dateOnly,
  pv_date: dateOnly,
  bp_date: dateOnly,
  demande_attestation_date: dateOnly,
  assay_date: dateOnly,
  archive_reference: shortText(255),

  // ── Declaration ──
  ceec_in_date: dateOnly,
  ceec_out_date: dateOnly,
  min_div_in_date: dateOnly,
  min_div_out_date: dateOnly,
  cgea_doc_ref: shortText(100),
  segues_rcv_ref: shortText(100),
  segues_payment_date: dateOnly,
  document_status_id: intIdNullable,
  customs_clearing_code: shortText(100),
  dgda_in_date: dateOnly,
  declaration_reference: shortText(100),
  liquidation_reference: shortText(100),
  liquidation_date: dateOnly,
  liquidation_paid_by: shortText(100),
  liquidation_amount: decimalString,
  quittance_reference: shortText(100),
  quittance_date: dateOnly,
  dgda_out_date: dateOnly,
  gov_docs_in_date: dateOnly,
  gov_docs_out_date: dateOnly,

  // ── Logistics ──
  dispatch_deliver_date: dateOnly,
  kanyaka_arrival_date: dateOnly,
  kanyaka_departure_date: dateOnly,
  border_arrival_date: dateOnly,
  exit_drc_date: dateOnly,
  end_of_formalities_date: dateOnly,
  truck_status_id: intIdNullable,
  lmc_id: shortText(100),
  ogefrem_inv_ref: shortText(100),
  loading_to_dispatch_date: dateOnly,
  lmc_date: dateOnly,
  ogefrem_date: dateOnly,
  audited_date: dateOnly,
  archived_date: dateOnly,

  // ── Status & Remarks ──
  clearing_status_id: intIdNullable,
  remarks: z.string().nullable().optional(),
});
export type ExportBody = z.infer<typeof exportBodySchema>;

export const exportListQuerySchema = z.object({
  q: z.string().optional(),
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  clearing_status_id: z.coerce.number().int().positive().optional(),
  document_status_id: z.coerce.number().int().positive().optional(),
  regime_id: z.coerce.number().int().positive().optional(),
  truck_status_id: z.coerce.number().int().positive().optional(),
  loading_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  loading_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExportListQuery = z.infer<typeof exportListQuerySchema>;
