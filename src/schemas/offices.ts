import { z } from 'zod';

export const officeCreateSchema = z.object({
  location_name: z.string().min(1).max(255),
});
export type OfficeCreateInput = z.infer<typeof officeCreateSchema>;

export const officeUpdateSchema = z.object({
  location_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type OfficeUpdateInput = z.infer<typeof officeUpdateSchema>;

export const officeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OfficeListQuery = z.infer<typeof officeListQuerySchema>;
