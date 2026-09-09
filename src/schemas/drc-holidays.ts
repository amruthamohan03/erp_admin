import { z } from 'zod';

/**
 * DRC public holidays (`drc_holidays_t`).
 *
 * Not a cosmetic list: `getHolidaySet` in [imkpi.ts](src/db/queries/imkpi.ts)
 * reads these to exclude them from the working-day delay KPIs, so adding or
 * removing one changes every processing-time figure the module reports. That is
 * exactly why it belongs in a master rather than a constant (§4.1) — the DRC
 * publishes movable feasts each year.
 */

/** 'fixed' = same calendar date every year; 'variable' = movable (religious feasts). */
export const HOLIDAY_TYPES = ['fixed', 'variable'] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

// Stored and transported as ISO; only the display layer uses DD-MM-YYYY (§4.19).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Holiday Date must be a real date (day, month and year).');

export const drcHolidayCreateSchema = z.object({
  holiday_date: isoDate,
  name_en: z.string().min(1, 'Name (English) is required.').max(150),
  // Optional: not every holiday has a distinct French name on file, and forcing
  // one would have operators retype the English.
  name_fr: z.string().max(150).optional().nullable(),
  holiday_type: z.enum(HOLIDAY_TYPES).default('fixed'),
});
export type DrcHolidayCreateInput = z.infer<typeof drcHolidayCreateSchema>;

export const drcHolidayUpdateSchema = z.object({
  holiday_date: isoDate.optional(),
  name_en: z.string().min(1, 'Name (English) is required.').max(150).optional(),
  name_fr: z.string().max(150).optional().nullable(),
  holiday_type: z.enum(HOLIDAY_TYPES).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DrcHolidayUpdateInput = z.infer<typeof drcHolidayUpdateSchema>;

export const drcHolidayListQuerySchema = z.object({
  q: z.string().optional(),
  /** Narrow to one calendar year — the way an operator actually reviews these. */
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  holiday_type: z.enum(HOLIDAY_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DrcHolidayListQuery = z.infer<typeof drcHolidayListQuerySchema>;
