import { z } from 'zod';

// Bivac / PARTIELLE management — request schemas (§4.7). Editing an allotment
// goes through the shared PARTIELLE API (partielleUpdateSchema), not a schema
// of its own, so both screens enforce the same budget rules.

// Licences list (import kinds 1,2) with computed balances. The Excel export
// parses the same schema, so the file and the grid accept the same filters.
export const bivacLicenseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  client_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BivacLicenseListQuery = z.infer<typeof bivacLicenseListQuerySchema>;
