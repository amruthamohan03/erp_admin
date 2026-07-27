import { z } from 'zod';

// Zod boundary schemas for the imports module (§2 step 3 — customs
// imports lifecycle). Every business field on `imports_t` is nullable
// at the DB level so the import row can be created from a single
// accordion-equivalent (Basic) and filled in over time. The body
// schema mirrors that — every field is optional + nullable.
//
// Field-presence enforcement (per workflow stage) belongs in a rule
// attached to the case template, not here. Keeping the boundary schema
// permissive keeps partial-create flows working without a tangle of
// "required-iff-state-is" Zod branches.

const intIdNullable = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional();

// Numeric / amount fields land as `numeric(15, 2)` on the DB —
// Drizzle accepts string or number on insert. Coerce to string so
// we don't lose precision through JS number coercion (15-digit
// totals straddle the safe-integer boundary).
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

export const importBodySchema = z.object({
  // ── Basic ──
  client_id: intIdNullable,
  license_id: intIdNullable,
  partial_id: intIdNullable,
  kind_id: intIdNullable,
  type_of_goods_id: intIdNullable,
  transport_mode_id: intIdNullable,
  mca_ref: shortText(100),
  currency_id: intIdNullable,
  license_invoice_number: shortText(100),
  supplier: shortText(255),
  regime_id: intIdNullable,
  types_of_clearance_id: intIdNullable,
  declaration_office_id: intIdNullable,
  pre_alert_date: dateOnly,
  invoice: shortText(100),
  commodity_id: intIdNullable,
  po_ref: shortText(100),

  // ── Financial ──
  fret: decimalString,
  fret_currency_id: intIdNullable,
  other_charges: decimalString,
  other_charges_currency_id: intIdNullable,
  weight: decimalString,
  rem_weight: decimalString,
  m3: decimalString,
  cession_date: dateOnly,
  fob: decimalString,
  r_fob: decimalString,
  r_fob_currency_id: intIdNullable,
  fob_currency_id: intIdNullable,
  insurance_date: dateOnly,
  insurance_amount: decimalString,
  insurance_amount_currency_id: intIdNullable,
  insurance_reference: shortText(100),

  // ── CRF & Declaration ──
  crf_reference: shortText(100),
  crf_received_date: dateOnly,
  clearing_based_on: shortText(50),
  ad_date: dateOnly,
  inspection_reports: shortText(100),
  archive_reference: shortText(100),
  audited_date: dateOnly,
  archived_date: dateOnly,

  // ── Transport Documents ──
  road_manif: shortText(100),
  airway_bill: shortText(100),
  container: shortText(100),
  entry_point_id: intIdNullable,
  wagon: shortText(100),
  airway_bill_weight: decimalString,
  horse: shortText(100),
  trailer_1: shortText(100),
  trailer_2: shortText(100),

  // ── Customs / DGDA ──
  dgda_in_date: dateOnly,
  declaration_reference: shortText(100),
  segues_rcv_ref: shortText(100),
  segues_payment_date: dateOnly,
  customs_manifest_number: shortText(100),
  customs_manifest_date: dateOnly,
  customs_clearance_code: shortText(100),
  dgda_out_date: dateOnly,
  document_status_id: intIdNullable,
  declaration_validity: shortText(50),
  t1_number: shortText(100),
  t1_date: dateOnly,

  // ── Liquidation & Quittance ──
  liquidation_reference: shortText(100),
  liquidation_date: dateOnly,
  liquidation_paid_by: shortText(100),
  liquidation_amount: decimalString,
  quittance_reference: shortText(100),
  quittance_date: dateOnly,

  // ── Air Transport ──
  airport_arrival_date: dateOnly,
  dispatch_from_airport: dateOnly,
  operating_company: shortText(50),
  operating_days: z.coerce.number().int().nullable().optional(),
  operating_amount: decimalString,

  // ── Routing & Warehouse ──
  arrival_date_zambia: dateOnly,
  dispatch_from_zambia: dateOnly,
  drc_entry_date: dateOnly,
  border_warehouse_arrival_date: dateOnly,
  dispatch_from_border: dateOnly,
  kanyaka_arrival_date: dateOnly,
  kanyaka_dispatch_date: dateOnly,
  warehouse_arrival_date: dateOnly,
  warehouse_departure_date: dateOnly,
  dispatch_deliver_date: dateOnly,
  ibs_coupon_reference: shortText(100),
  border_warehouse_id: intIdNullable,
  entry_coupon: shortText(100),
  bonded_warehouse_id: intIdNullable,
  truck_status: shortText(100),

  // ── Status & Remarks ──
  clearing_status_id: intIdNullable,
  inv_export_disabled: z.boolean().optional(),
  inv_export_disabled_remark: shortText(500),
  remarks: z.string().nullable().optional(),
});
export type ImportBody = z.infer<typeof importBodySchema>;

export const importListQuerySchema = z.object({
  q: z.string().optional(),
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  clearing_status_id: z.coerce.number().int().positive().optional(),
  document_status_id: z.coerce.number().int().positive().optional(),
  regime_id: z.coerce.number().int().positive().optional(),
  // Advanced-filter-bar params (ported from main's /import list).
  type_of_goods_id: z.coerce.number().int().positive().optional(),
  entry_point_id: z.coerce.number().int().positive().optional(),
  transport_mode_id: z.coerce.number().int().positive().optional(),
  pre_alert_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  pre_alert_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  // §8 dashboard cards — comma-separated status filter keys, combined with AND.
  status_filters: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ImportListQuery = z.infer<typeof importListQuerySchema>;
