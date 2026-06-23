import { z } from 'zod';

export const truckStatusCreateSchema = z.object({
  truck_status: z.string().min(1).max(300),
});
export type TruckStatusCreateInput = z.infer<typeof truckStatusCreateSchema>;

export const truckStatusUpdateSchema = z.object({
  truck_status: z.string().min(1).max(300).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type TruckStatusUpdateInput = z.infer<typeof truckStatusUpdateSchema>;

export const truckStatusListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TruckStatusListQuery = z.infer<typeof truckStatusListQuerySchema>;
