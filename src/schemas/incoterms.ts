import { z } from 'zod';

export const incotermCreateSchema = z.object({
  incoterm_short_name: z.string().min(1).max(10),
  incoterm_full_name: z.string().min(1).max(250),
});
export type IncotermCreateInput = z.infer<typeof incotermCreateSchema>;

export const incotermUpdateSchema = z.object({
  incoterm_short_name: z.string().min(1).max(10).optional(),
  incoterm_full_name: z.string().min(1).max(250).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type IncotermUpdateInput = z.infer<typeof incotermUpdateSchema>;

export const incotermListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type IncotermListQuery = z.infer<typeof incotermListQuerySchema>;
