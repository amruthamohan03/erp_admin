import { z } from 'zod';

export const currencyCreateSchema = z.object({
  currency_name: z.string().min(1).max(100),
  currency_short_name: z.string().min(1).max(10),
});
export type CurrencyCreateInput = z.infer<typeof currencyCreateSchema>;

export const currencyUpdateSchema = z.object({
  currency_name: z.string().min(1).max(100).optional(),
  currency_short_name: z.string().min(1).max(10).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type CurrencyUpdateInput = z.infer<typeof currencyUpdateSchema>;

export const currencyListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CurrencyListQuery = z.infer<typeof currencyListQuerySchema>;
