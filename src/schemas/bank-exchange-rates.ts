import { z } from 'zod';

// Decimal handling: numeric(10,4) on the DB. Coerce to string so JS
// number precision can't drop trailing zeros (`1.0500` stays
// `1.0500`, not `1.05`).
const rateString = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return v;
    return typeof v === 'number' ? v.toString() : v;
  });

export const bankExchangeRateCreateSchema = z.object({
  bank_id: z.coerce.number().int().positive(),
  currency_id: z.coerce.number().int().positive(),
  exchange_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be YYYY-MM-DD'),
  bcc_rate: rateString,
  bank_rate: rateString,
});
export type BankExchangeRateCreateInput = z.infer<
  typeof bankExchangeRateCreateSchema
>;

export const bankExchangeRateUpdateSchema = z.object({
  bank_id: z.coerce.number().int().positive().optional(),
  currency_id: z.coerce.number().int().positive().optional(),
  exchange_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  bcc_rate: rateString,
  bank_rate: rateString,
});
export type BankExchangeRateUpdateInput = z.infer<
  typeof bankExchangeRateUpdateSchema
>;

export const bankExchangeRateListQuerySchema = z.object({
  bank_id: z.coerce.number().int().positive().optional(),
  currency_id: z.coerce.number().int().positive().optional(),
  // Date range — both inclusive. Single-day lookup: from=to.
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type BankExchangeRateListQuery = z.infer<
  typeof bankExchangeRateListQuerySchema
>;
