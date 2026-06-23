import { z } from 'zod';

export const feetContainerCreateSchema = z.object({
  feet_container_size: z.string().min(1).max(50),
});
export type FeetContainerCreateInput = z.infer<
  typeof feetContainerCreateSchema
>;

export const feetContainerUpdateSchema = z.object({
  feet_container_size: z.string().min(1).max(50).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type FeetContainerUpdateInput = z.infer<
  typeof feetContainerUpdateSchema
>;

export const feetContainerListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type FeetContainerListQuery = z.infer<
  typeof feetContainerListQuerySchema
>;
