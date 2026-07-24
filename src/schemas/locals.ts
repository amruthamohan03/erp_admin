import { z } from 'zod';

// Local Tracking — list query schema (§4.7).
export const localListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  location_filter: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type LocalListQuery = z.infer<typeof localListQuerySchema>;
