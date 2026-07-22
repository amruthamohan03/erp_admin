import { z } from 'zod';

export const officeLocationCreateSchema = z.object({
  location_name: z.string().min(1).max(255),
  province_id: z.coerce.number().int().positive().optional().nullable(),
});
export type OfficeLocationCreateInput = z.infer<
  typeof officeLocationCreateSchema
>;

export const officeLocationUpdateSchema = z.object({
  location_name: z.string().min(1).max(255).optional(),
  province_id: z.coerce.number().int().positive().optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});
export type OfficeLocationUpdateInput = z.infer<
  typeof officeLocationUpdateSchema
>;

export const officeLocationListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OfficeLocationListQuery = z.infer<
  typeof officeLocationListQuerySchema
>;
