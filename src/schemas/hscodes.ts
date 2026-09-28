import { z } from 'zod';

// Body shape for hscode_master_t. HS code number + five rate
// percentages (0-100%). Rates stored as `numeric(5,2)` strings on the
// DB side; the form coerces to string before send so JS number
// precision doesn't truncate trailing decimals.

/**
 * A customs rate, as a percentage.
 *
 * This used to be `z.union([z.string(), z.number()])` with no check at all, so
 * any string satisfied it — `"abc"` passed validation, reached Postgres as a
 * numeric literal and came back as SQLSTATE 22P02. The form could not produce
 * that (its input is `type="number"`), but the endpoint is public and §4.7 puts
 * the guarantee at the boundary rather than in the UI.
 *
 * Bounded by what the column can actually hold — numeric(5,2), so 0 to 999.99 —
 * NOT by 100. An excise duty above 100% is unusual but real, and a schema that
 * refuses a rate the tariff genuinely sets would be worse than one that allows a
 * typo. The column's own capacity is the honest limit.
 */
const ratePercent = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return undefined;
    return typeof v === 'number' ? v.toString() : v.trim();
  })
  .refine(
    (v) => v === undefined || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 999.99),
    { message: 'Must be a percentage between 0 and 999.99, with at most 2 decimals (e.g. 10.00)' },
  );

/**
 * The per-code green-certificate OVERRIDE — tri-state, and NULL is the normal
 * value (0124).
 *
 * `null` defers to the prefix rules in `hs_green_prefix_master_t`; `true` and
 * `false` state an exception in either direction. A plain `z.boolean()` would
 * turn "no decision recorded" into "explicitly exempt" on every save, which
 * silently opts each edited code out of whatever rule covers it.
 */
const greenCertificateOverride = z.boolean().nullish().transform((v) => v ?? null);

export const hscodeCreateSchema = z.object({
  hscode_number: z.string().min(1).max(100),
  hscode_ddi: ratePercent,
  hscode_ica: ratePercent,
  hscode_dci: ratePercent,
  hscode_dcl: ratePercent,
  hscode_tpi: ratePercent,
  requires_green_certificate: greenCertificateOverride,
});
export type HscodeCreateInput = z.infer<typeof hscodeCreateSchema>;

export const hscodeUpdateSchema = z.object({
  hscode_number: z.string().min(1).max(100).optional(),
  hscode_ddi: ratePercent,
  hscode_ica: ratePercent,
  hscode_dci: ratePercent,
  hscode_dcl: ratePercent,
  hscode_tpi: ratePercent,
  // Nullable but NOT defaulted: on an update `undefined` means "leave the
  // override alone" and `null` means "clear it, follow the prefix rules". The
  // create schema collapses the two because a code that has just been made has
  // nothing to leave alone.
  requires_green_certificate: z.boolean().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type HscodeUpdateInput = z.infer<typeof hscodeUpdateSchema>;

export const hscodeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HscodeListQuery = z.infer<typeof hscodeListQuerySchema>;
