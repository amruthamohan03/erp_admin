import { z } from 'zod';

/**
 * The regional office a declaration desk reports to, or nothing.
 *
 * `''` is what a cleared dropdown posts, so it means "not assigned yet" rather
 * than a validation failure — the column is nullable precisely because existing
 * desks have to be filled in from the screen (migration 0077).
 */
const mainOfficeId = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const subOfficeCreateSchema = z.object({
  sub_office_name: z.string().min(1).max(255),
  main_office_id: mainOfficeId,
});
export type SubOfficeCreateInput = z.infer<typeof subOfficeCreateSchema>;

export const subOfficeUpdateSchema = z.object({
  sub_office_name: z.string().min(1).max(255).optional(),
  main_office_id: mainOfficeId,
  display: z.enum(['Y', 'N']).optional(),
});
export type SubOfficeUpdateInput = z.infer<typeof subOfficeUpdateSchema>;

export const subOfficeListQuerySchema = z.object({
  q: z.string().optional(),
  /** Narrow the list to one region — the point of the link. */
  main_office_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SubOfficeListQuery = z.infer<typeof subOfficeListQuerySchema>;
