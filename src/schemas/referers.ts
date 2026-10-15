import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const refererCreateSchema = z.object({
  referer_name: z.string().min(1).max(255),
  display: z.enum(['Y', 'N']).optional(),
});
export type RefererCreateInput = z.infer<typeof refererCreateSchema>;

export const refererUpdateSchema = z.object({
  referer_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type RefererUpdateInput = z.infer<typeof refererUpdateSchema>;

export const refererListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so dropdowns still see only enabled rows; the master's
  // own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RefererListQuery = z.infer<typeof refererListQuerySchema>;
