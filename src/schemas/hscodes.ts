import { z } from 'zod';

// Body shape for hscode_master_t. HS code number + five rate
// percentages (0-100%). Rates stored as `numeric(5,2)` strings on the
// DB side; the form coerces to string before send so JS number
// precision doesn't truncate trailing decimals.

const ratePercent = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return v;
    return typeof v === 'number' ? v.toString() : v;
  });

export const hscodeCreateSchema = z.object({
  hscode_number: z.string().min(1).max(100),
  hscode_ddi: ratePercent,
  hscode_ica: ratePercent,
  hscode_dci: ratePercent,
  hscode_dcl: ratePercent,
  hscode_tpi: ratePercent,
});
export type HscodeCreateInput = z.infer<typeof hscodeCreateSchema>;

export const hscodeUpdateSchema = z.object({
  hscode_number: z.string().min(1).max(100).optional(),
  hscode_ddi: ratePercent,
  hscode_ica: ratePercent,
  hscode_dci: ratePercent,
  hscode_dcl: ratePercent,
  hscode_tpi: ratePercent,
  display: z.enum(['Y', 'N']).optional(),
});
export type HscodeUpdateInput = z.infer<typeof hscodeUpdateSchema>;

export const hscodeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HscodeListQuery = z.infer<typeof hscodeListQuerySchema>;
