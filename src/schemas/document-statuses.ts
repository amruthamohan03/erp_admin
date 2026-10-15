import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

const typeSchema = z
  .string()
  .min(1)
  .max(2)
  .regex(/^[IEU]+$/, 'type must contain only I, E, U');

export const documentStatusCreateSchema = z.object({
  document_status: z.string().min(1).max(300),
  type: typeSchema,
  display: z.enum(['Y', 'N']).optional(),
});
export type DocumentStatusCreateInput = z.infer<typeof documentStatusCreateSchema>;

export const documentStatusUpdateSchema = z.object({
  document_status: z.string().min(1).max(300).optional(),
  type: typeSchema.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DocumentStatusUpdateInput = z.infer<typeof documentStatusUpdateSchema>;

export const documentStatusListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  type: typeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DocumentStatusListQuery = z.infer<typeof documentStatusListQuerySchema>;
