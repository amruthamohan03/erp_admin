// §4.7 — Zod schema for the §9 bulk-update payload.
import { z } from 'zod';

export const bulkUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        // field → value; the server whitelists keys and validates per-type.
        values: z.record(z.string(), z.unknown()),
      }),
    )
    .max(2000),
});

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;
