import { z } from 'zod';

export const bankCreateSchema = z.object({
  bank_name: z.string().min(1).max(200),
  bank_code: z.string().min(1).max(20),
  for_exchange: z.enum(['Y', 'N']).optional(),
});
export type BankCreateInput = z.infer<typeof bankCreateSchema>;

export const bankUpdateSchema = z.object({
  bank_name: z.string().min(1).max(200).optional(),
  bank_code: z.string().min(1).max(20).optional(),
  for_exchange: z.enum(['Y', 'N']).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type BankUpdateInput = z.infer<typeof bankUpdateSchema>;

export const bankListQuerySchema = z.object({
  q: z.string().optional(),
  // ?for_exchange=Y scopes to banks that act as exchange-rate sources.
  for_exchange: z.enum(['Y', 'N']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type BankListQuery = z.infer<typeof bankListQuerySchema>;
