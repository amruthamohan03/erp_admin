import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const feetContainerCreateSchema = z.object({
  feet_container_size: z.string().min(1).max(50),
  display: z.enum(['Y', 'N']).optional(),
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
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled sizes; the master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type FeetContainerListQuery = z.infer<
  typeof feetContainerListQuerySchema
>;
