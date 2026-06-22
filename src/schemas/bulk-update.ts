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
