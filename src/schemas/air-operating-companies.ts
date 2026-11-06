import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

/** The menu URL that IS this master's permission resource (§4.7). */
export const AIR_OPERATING_COMPANY_RESOURCE = '/masters/air-operating-companies';

// 50, the width of imports_t.operating_company — the column this name is copied
// into when a file picks it.
const name = z
  .string()
  .trim()
  .min(1, 'Air Operating Company Name is required.')
  .max(50, 'Air Operating Company Name must be 50 characters or fewer.');

export const airOperatingCompanyCreateSchema = z.object({
  air_operating_company_name: name,
  display: z.enum(['Y', 'N']).optional(),
});
export type AirOperatingCompanyCreateInput = z.infer<typeof airOperatingCompanyCreateSchema>;

export const airOperatingCompanyUpdateSchema = z.object({
  air_operating_company_name: name.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type AirOperatingCompanyUpdateInput = z.infer<typeof airOperatingCompanyUpdateSchema>;

export const airOperatingCompanyListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so the Import Tracking dropdown sees only enabled operators;
  // the master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AirOperatingCompanyListQuery = z.infer<typeof airOperatingCompanyListQuerySchema>;
