import { z } from 'zod';

export const mainOfficeCreateSchema = z.object({
  main_location_name: z.string().min(1).max(255),
});
export type MainOfficeCreateInput = z.infer<typeof mainOfficeCreateSchema>;

export const mainOfficeUpdateSchema = z.object({
  main_location_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type MainOfficeUpdateInput = z.infer<typeof mainOfficeUpdateSchema>;

export const mainOfficeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type MainOfficeListQuery = z.infer<typeof mainOfficeListQuerySchema>;
