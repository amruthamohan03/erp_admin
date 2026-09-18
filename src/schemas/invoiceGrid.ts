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
  // Import's customs category is billed in CDF, not USD (main's category-1
  // columns). total_cdf is recomputed as rate + vat on save; the submitted one
  // is ignored.
  cif_split: num.default(0),
  percentage: num.default(0),
  rate_cdf: num.default(0),
  vat_cdf: num.default(0),
  total_cdf: num.default(0),
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
  // Export: the DGDA rate this file's liquidation is converted at. Liquidation
  // USD is recomputed from it on save (CDF ÷ rate).
  bcc_rate: num.default(0),
  feet_container_id: z.number().int().nullable().optional(),
  ceec_amount: num.default(0),
  cgea_amount: num.default(0),
  occ_amount: num.default(0),
  lmc_amount: num.default(0),
  ogefrem_amount: num.default(0),
});

export const gridSaveSchema = z.object({
  quotation_id: z.number().int().nullable().optional(),
  // Import: whether the customs (CDF) category is on the invoice — 'S' shown,
  // 'H' hidden. main's `first_categoty_edited` (sic), column name kept.
  first_categoty_edited: z.enum(['H', 'S']).optional(),
  mcaDetails: z.array(gridMcaSchema).default([]),
  items: z.array(gridItemSchema).default([]),
});

export type GridSaveInput = z.infer<typeof gridSaveSchema>;
