import { z } from 'zod';

export const clearingStatusCreateSchema = z.object({
  clearing_status: z.string().min(1).max(100),
});
export type ClearingStatusCreateInput = z.infer<typeof clearingStatusCreateSchema>;

export const clearingStatusUpdateSchema = z.object({
  clearing_status: z.string().min(1).max(100).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClearingStatusUpdateInput = z.infer<typeof clearingStatusUpdateSchema>;

export const clearingStatusListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ClearingStatusListQuery = z.infer<typeof clearingStatusListQuerySchema>;
