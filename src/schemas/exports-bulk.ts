import { z } from 'zod';

// Boundary schema for POST /api/v1/exports/bulk-create.
//
// Shape mirrors main's `/api/exports/bulk-insert`: one `common`
// block carrying the fields every row shares (client, license,
// mca_ref prefix, optional shared masters) plus a `rows` array
// with per-row data.
//
// Cap enforcement lives in the handler, not here — schema-level
// numeric validation just guards the individual row values so a
// negative FOB / weight never reaches the SUM math.

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
  loading_date: dateOnly,
  weight: nonNeg.optional(),
  fob: nonNeg.optional(),
  horse: shortText(50),
  trailer_1: shortText(50),
  trailer_2: shortText(50),
  wagon_ref: shortText(50),
  container: shortText(50),
  transporter: shortText(255),
  destination: shortText(255),
  lot_number: shortText(100),
  number_of_bags: z.coerce.number().int().nonnegative().nullable().optional(),
  dgda_seal_no: shortText(255),
  number_of_seals: z.coerce.number().int().nonnegative().nullable().optional(),
  site_of_loading_id: intIdOptional,
  exit_point_id: intIdOptional,
  feet_container_id: intIdOptional,
});
export type ExportsBulkRow = z.infer<typeof rowSchema>;

export const exportsBulkCreateSchema = z.object({
  common: z.object({
    client_id: intId,
    license_id: intId,
    // No mca_ref here, and no prefix either. §4.33 — every reference is built
    // server-side from the format configured under Developer Options, numbered
    // on from the highest already issued for these codes. An operator typing a
    // prefix was a second, competing definition of what a reference looks like,
    // and it did not follow the configured one.
    // Optional shared masters — applied to every row.
    kind_id: intIdOptional,
    transport_mode_id: intIdOptional,
    type_of_goods_id: intIdOptional,
    regime_id: intIdOptional,
    types_of_clearance_id: intIdOptional,
    currency_id: intIdOptional,
    buyer: shortText(255),
    bp_no: shortText(100),
  }),
  rows: z.array(rowSchema).min(1).max(500),
});
export type ExportsBulkCreateBody = z.infer<typeof exportsBulkCreateSchema>;
