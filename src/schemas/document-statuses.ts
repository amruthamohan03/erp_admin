import { z } from 'zod';

const typeSchema = z
  .string()
  .min(1)
  .max(2)
  .regex(/^[IEU]+$/, 'type must contain only I, E, U');

export const documentStatusCreateSchema = z.object({
  document_status: z.string().min(1).max(300),
  type: typeSchema,
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
  type: typeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DocumentStatusListQuery = z.infer<typeof documentStatusListQuerySchema>;
