import { z } from 'zod';

// Boundary schema for POST /api/v1/imports/bulk-create.
//
// Mirrors exports-bulk (same cap-enforcement shape, same MCA
// prefix scheme) but with import-side fields — supplier, invoice,
// pre-alert date, transport docs. Kept as a separate file so the
// two entity flavors can evolve independently (imports carry more
// customs-declaration fields than exports do).

const intId = z.coerce.number().int().positive();
const intIdOptional = intId.nullable().optional();
const shortText = (max: number) =>
  z.string().max(max).nullable().optional();
const nonNeg = z.coerce.number().nonnegative();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'YYYY-MM-DD')
  .nullable()
  .optional();

const rowSchema = z.object({
  pre_alert_date: dateOnly,
  weight: nonNeg.optional(),
  fob: nonNeg.optional(),
  invoice: shortText(100),
  po_ref: shortText(100),
  supplier: shortText(255),
  road_manif: shortText(100),
  airway_bill: shortText(100),
  container: shortText(100),
  horse: shortText(100),
  trailer_1: shortText(100),
  trailer_2: shortText(100),
  entry_point_id: intIdOptional,
  commodity_id: intIdOptional,
  hscode_id: intIdOptional,
  incoterm_id: intIdOptional,
});
export type ImportsBulkRow = z.infer<typeof rowSchema>;

export const importsBulkCreateSchema = z.object({
  common: z.object({
    client_id: intId,
    license_id: intId,
    mca_ref_prefix: z.string().min(1).max(80),
    // Shared masters applied to every row.
    kind_id: intIdOptional,
    transport_mode_id: intIdOptional,
    type_of_goods_id: intIdOptional,
    regime_id: intIdOptional,
    types_of_clearance_id: intIdOptional,
    currency_id: intIdOptional,
    declaration_office_id: intIdOptional,
  }),
  rows: z.array(rowSchema).min(1).max(500),
});
export type ImportsBulkCreateBody = z.infer<typeof importsBulkCreateSchema>;
