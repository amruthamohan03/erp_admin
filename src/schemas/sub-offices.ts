import { z } from 'zod';

export const subOfficeCreateSchema = z.object({
  sub_office_name: z.string().min(1).max(255),
});
export type SubOfficeCreateInput = z.infer<typeof subOfficeCreateSchema>;

export const subOfficeUpdateSchema = z.object({
  sub_office_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type SubOfficeUpdateInput = z.infer<typeof subOfficeUpdateSchema>;

export const subOfficeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SubOfficeListQuery = z.infer<typeof subOfficeListQuerySchema>;
