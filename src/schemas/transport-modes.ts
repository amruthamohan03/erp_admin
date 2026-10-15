import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const transportModeCreateSchema = z.object({
  transport_mode_name: z.string().min(1).max(100),
  transport_letter: z.string().min(1).max(5),
  display: z.enum(['Y', 'N']).optional(),
});
export type TransportModeCreateInput = z.infer<typeof transportModeCreateSchema>;

export const transportModeUpdateSchema = z.object({
  transport_mode_name: z.string().min(1).max(100).optional(),
  transport_letter: z.string().min(1).max(5).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type TransportModeUpdateInput = z.infer<typeof transportModeUpdateSchema>;

export const transportModeListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so dropdowns still see only enabled rows; the master's
  // own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TransportModeListQuery = z.infer<typeof transportModeListQuerySchema>;
