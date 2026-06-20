import { z } from 'zod';

export const unitCreateSchema = z.object({
  unit_name: z.string().min(1).max(100),
  unit_code: z.string().max(20).optional().nullable(),
});
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;

export const unitUpdateSchema = z.object({
  unit_name: z.string().min(1).max(100).optional(),
  unit_code: z.string().max(20).optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

export const unitListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type UnitListQuery = z.infer<typeof unitListQuerySchema>;
