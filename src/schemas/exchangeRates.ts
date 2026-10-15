import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

// Body shapes for exchange_rate_master_t — the day's reference rates (§4.1).

/**
 * A rate as `numeric(10,4)` accepts it.
 *
 * Bounded by what the column holds rather than by a guess at a plausible rate:
 * the CDF has been through enough that a ceiling invented here would one day
 * refuse a real published figure (§4.23's note that the column's own capacity
 * is the honest limit).
 */
const rate = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'number' ? v.toString() : v.trim();
  })
  .refine((v) => v === null || (/^\d{1,6}(\.\d{1,4})?$/u.test(v) && Number(v) > 0), {
    message: 'Must be a positive rate with at most 4 decimals (e.g. 2850.0000).',
  });

const rateDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Date must be YYYY-MM-DD.');

export const exchangeRateCreateSchema = z
  .object({
    rate_date: rateDate,
    currency_id: z.coerce.number().int().positive('Choose a currency.'),
    declaration_rate: rate,
    bcc_rate: rate,
    display: z.enum(['Y', 'N']).optional(),
  })
  // A row with neither figure says nothing and would occupy the day's one slot,
  // so the board would find it and still have nothing to prefill (§4.23 — name
  // what is wrong and what would fix it).
  .refine((d) => d.declaration_rate !== null || d.bcc_rate !== null, {
    message: 'Enter at least one of Declaration Rate or BCC Rate.',
    path: ['declaration_rate'],
  });
export type ExchangeRateCreateInput = z.infer<typeof exchangeRateCreateSchema>;

export const exchangeRateUpdateSchema = z.object({
  rate_date: rateDate.optional(),
  currency_id: z.coerce.number().int().positive().optional(),
  // `.optional()` so an absent figure stays absent: `rate` alone maps undefined
  // to null, which made a status-only PUT (`{ display }`) wipe both rates.
  declaration_rate: rate.optional(),
  bcc_rate: rate.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ExchangeRateUpdateInput = z.infer<typeof exchangeRateUpdateSchema>;

export const exchangeRateListQuerySchema = z.object({
  q: z.string().optional(),
  currency_id: z.coerce.number().int().positive().nullish(),
  // Off by default so the Bank Exchange Rate board and every other reader still
  // see only enabled rates; the master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExchangeRateListQuery = z.infer<typeof exchangeRateListQuerySchema>;

/** What the board asks for when the operator picks a day and a currency. */
export const exchangeRateForDayQuerySchema = z.object({
  date: rateDate,
  currency_id: z.coerce.number().int().positive(),
});
export type ExchangeRateForDayQuery = z.infer<typeof exchangeRateForDayQuerySchema>;
