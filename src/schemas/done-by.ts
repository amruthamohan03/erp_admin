import { z } from 'zod';

export const doneByCreateSchema = z.object({
  done_by_name: z.string().min(1).max(50),
});
export type DoneByCreateInput = z.infer<typeof doneByCreateSchema>;

export const doneByUpdateSchema = z.object({
  done_by_name: z.string().min(1).max(50).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DoneByUpdateInput = z.infer<typeof doneByUpdateSchema>;

export const doneByListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DoneByListQuery = z.infer<typeof doneByListQuerySchema>;
