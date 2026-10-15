import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const originCreateSchema = z.object({
  origin_name: z.string().min(1).max(255),
  display: z.enum(['Y', 'N']).optional(),
});
export type OriginCreateInput = z.infer<typeof originCreateSchema>;

export const originUpdateSchema = z.object({
  origin_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type OriginUpdateInput = z.infer<typeof originUpdateSchema>;

export const originListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OriginListQuery = z.infer<typeof originListQuerySchema>;
