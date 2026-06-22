import { z } from 'zod';

export const clearanceCreateSchema = z.object({
  clearance_name: z.string().min(1).max(255),
});
export type ClearanceCreateInput = z.infer<typeof clearanceCreateSchema>;

export const clearanceUpdateSchema = z.object({
  clearance_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClearanceUpdateInput = z.infer<typeof clearanceUpdateSchema>;

export const clearanceListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ClearanceListQuery = z.infer<typeof clearanceListQuerySchema>;
