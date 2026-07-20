import { z } from 'zod';
import { predicateSchema, type Predicate } from '@/lib/bulkUpdate';

export const bulkUpdatePreviewRequestSchema = z.object({
  entity: z.string().min(1),
  predicate: predicateSchema,
});
export type BulkUpdatePreviewRequest = z.infer<typeof bulkUpdatePreviewRequestSchema>;

export const bulkUpdateApplyRequestSchema = z.object({
  entity: z.string().min(1),
  predicate: predicateSchema,
  patch: z.record(z.string(), z.unknown()),
});
export type BulkUpdateApplyRequest = z.infer<typeof bulkUpdateApplyRequestSchema>;

export { predicateSchema };
export type { Predicate };

// ── Per-row bulk edit ────────────────────────────────────────────

export const bulkEditRowsRequestSchema = z.object({
  entity: z.string().min(1),
  predicate: predicateSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  displayColumns: z.array(z.string().min(1)).optional(),
});
export type BulkEditRowsRequest = z.infer<typeof bulkEditRowsRequestSchema>;

export const bulkEditApplyRequestSchema = z.object({
  entity: z.string().min(1),
  edits: z
    .array(
      z.object({
        id: z.number().int().positive(),
        patch: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(1000),
});
export type BulkEditApplyRequest = z.infer<typeof bulkEditApplyRequestSchema>;
