import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const doneByCreateSchema = z.object({
  done_by_name: z.string().min(1).max(50),
  display: z.enum(['Y', 'N']).optional(),
});
export type DoneByCreateInput = z.infer<typeof doneByCreateSchema>;

export const doneByUpdateSchema = z.object({
  done_by_name: z.string().min(1).max(50).optional(),
  display: z.enum(['Y', 'N']).optional(),
  // Marks the row that stands for the operating company. Its label then renders
  // as the configured project name — see src/lib/doneByLabel.ts.
  is_company: z.boolean().optional(),
});
export type DoneByUpdateInput = z.infer<typeof doneByUpdateSchema>;

export const doneByListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled entries; the Done By master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DoneByListQuery = z.infer<typeof doneByListQuerySchema>;
