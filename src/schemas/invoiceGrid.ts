// §4.7 — Zod schema for the invoice-grid save payload (MCA details + line items).
// Shared by the export and import grid POST routes.
import { z } from 'zod';

const num = z.coerce.number().finite();
const nstr = z.string().nullable().optional();

export const gridItemSchema = z.object({
  id: z.number().int().optional(),
  quotation_item_id: z.number().int().nullable(),
  category_id: z.number().int().nullable(),
  category_name: nstr,
  category_header: nstr,
  display_order: num.default(0),
  item_id: z.number().int().nullable(),
  item_name: nstr,
  unit_id: z.number().int().nullable(),
  unit_text: nstr,
  quantity: num.default(1),
  taux_usd: num.default(0),
  cost_usd: num.default(0),
  currency_id: z.number().int().nullable(),
  has_tva: num.default(0),
  tva_usd: num.default(0),
  subtotal_usd: num.default(0),
  total_usd: num.default(0),
});

export const gridMcaSchema = z.object({
  id: z.number().int().optional(),
  mca_id: z.number().int().nullable(),
  display_order: num.default(0),
  lot_number: nstr,
  declaration_no: nstr,
  declaration_date: nstr,
  liquidation_no: nstr,
  liquidation_date: nstr,
  liquidation_amount: num.default(0),
  liquidation_usd: num.default(0),
  quittance_no: nstr,
  quittance_date: nstr,
  horse: nstr,
  trailer_1: nstr,
  trailer_2: nstr,
  container: nstr,
  weight: num.default(0),
  buyer: nstr,
  ceec_amount: num.default(0),
  cgea_amount: num.default(0),
  occ_amount: num.default(0),
  lmc_amount: num.default(0),
  ogefrem_amount: num.default(0),
});

export const gridSaveSchema = z.object({
  quotation_id: z.number().int().nullable().optional(),
  mcaDetails: z.array(gridMcaSchema).default([]),
  items: z.array(gridItemSchema).default([]),
});

export type GridSaveInput = z.infer<typeof gridSaveSchema>;
