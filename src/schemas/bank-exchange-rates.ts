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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be a date in YYYY-MM-DD form');

/**
 * A positive rate. `numeric(10,4)` caps the value, and a rate of zero or less is
 * not a rate — it is an empty cell that reached the server (§4.23 names both).
 */
const positiveRate = z.coerce
  .number({ invalid_type_error: 'Must be a number' })
  .positive('Must be greater than 0')
  .max(999_999.9999, 'Must be 999,999.9999 or less');

/**
 * GET the day's board: which banks, and what each of them quoted.
 *
 * `currency_id` is OPTIONAL. Omitted, the route resolves the currency that
 * actually carries rates — a board that opens on a currency nobody quotes shows
 * an empty grid and an empty history, which reads as a broken screen rather than
 * as "no data for CDF". The response always states the currency it resolved to,
 * so the caller adopts it rather than guessing.
 */
export const bankExchangeRateBoardQuerySchema = z.object({
  date: isoDate,
  currency_id: z.coerce.number().int().positive().optional(),
});
export type BankExchangeRateBoardQuery = z.infer<typeof bankExchangeRateBoardQuerySchema>;

/**
 * Save the whole day in one request.
 *
 * The board is one record to an operator — a date, the BCC reference, and what
 * each bank quoted against it — so it saves as one transaction rather than a
 * PUT per bank, the same reasoning as §4.17. A half-saved board would compare
 * today's banks against yesterday's reference.
 */
export const bankExchangeRateBoardSaveSchema = z.object({
  exchange_date: isoDate,
  currency_id: z.coerce.number().int().positive(),
  bcc_rate: positiveRate,
  rates: z
    .array(
      z.object({
        bank_id: z.coerce.number().int().positive(),
        bank_rate: positiveRate,
      }),
    )
    .min(1, 'Enter a rate for at least one bank'),
});
export type BankExchangeRateBoardSaveInput = z.infer<typeof bankExchangeRateBoardSaveSchema>;

/** Remove a whole day from the board (soft delete — §4.27). */
export const bankExchangeRateBoardDeleteSchema = z.object({
  exchange_date: isoDate,
  currency_id: z.coerce.number().int().positive(),
});

/** The pivoted history below the board: one row per date, one column per bank. */
export const bankExchangeRateHistoryQuerySchema = z.object({
  currency_id: z.coerce.number().int().positive(),
  q: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BankExchangeRateHistoryQuery = z.infer<typeof bankExchangeRateHistoryQuerySchema>;

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
