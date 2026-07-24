import { z } from 'zod';

// Bivac / PARTIELLE management — request schemas (§4.7).

// Licences list (import kinds 1,2) with computed balances.
export const bivacLicenseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  client_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BivacLicenseListQuery = z.infer<typeof bivacLicenseListQuerySchema>;

// A non-negative money/weight amount, rounded to 2dp.
const amount = z.coerce
  .number()
  .min(0, 'Must be zero or greater')
  .max(9_999_999_999_999, 'Too large')
  .transform((n) => Math.round(n * 100) / 100);

// Update a PARTIELLE's five editable allocation amounts.
export const bivacPartialUpdateSchema = z.object({
  partial_weight: amount,
  partial_fob: amount,
  partial_insurance: amount,
  partial_freight: amount,
  partial_other_costs: amount,
});
export type BivacPartialUpdate = z.infer<typeof bivacPartialUpdateSchema>;
