import { z } from 'zod';

// §4.1 — `use_for_import` / `use_for_export` say which forms may offer a kind.
// A kind can be both: a temporary import leaves again as a re-export, which the
// name-prefix classification these replaced could never express.
export const kindCreateSchema = z.object({
  kind_name: z.string().min(1).max(100),
  kind_short_name: z.string().min(1).max(20),
  use_for_import: z.boolean().default(false),
  use_for_export: z.boolean().default(false),
});
export type KindCreateInput = z.infer<typeof kindCreateSchema>;

export const kindUpdateSchema = z.object({
  kind_name: z.string().min(1).max(100).optional(),
  kind_short_name: z.string().min(1).max(20).optional(),
  use_for_import: z.boolean().optional(),
  use_for_export: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type KindUpdateInput = z.infer<typeof kindUpdateSchema>;

export const kindListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type KindListQuery = z.infer<typeof kindListQuerySchema>;
