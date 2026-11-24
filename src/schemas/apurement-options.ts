import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

/** The menu URL that IS this master's permission resource (§4.7). */
export const APUREMENT_OPTION_RESOURCE = '/masters/apurement-options';

/** What each group is called on screen — the grid's two column headings. */
export const APUREMENT_OPTION_GROUP_LABELS = { type: 'Type', remark: 'Remarque' } as const;

const group = z.enum(['type', 'remark'], {
  errorMap: () => ({ message: 'Dropdown must be Type or Remarque.' }),
});

const name = z
  .string()
  .trim()
  .min(1, 'Option Name is required.')
  .max(100, 'Option Name must be 100 characters or fewer.');

export const apurementOptionCreateSchema = z.object({
  option_group: group,
  option_name: name,
  requires_remark: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ApurementOptionCreateInput = z.infer<typeof apurementOptionCreateSchema>;

// The group is fixed once created: moving a Type into the Remarque list would
// leave the files that hold it pointing at a value of the wrong kind.
export const apurementOptionUpdateSchema = z.object({
  option_name: name.optional(),
  requires_remark: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ApurementOptionUpdateInput = z.infer<typeof apurementOptionUpdateSchema>;

export const apurementOptionListQuerySchema = z.object({
  q: z.string().optional(),
  group: group.optional(),
  // Off by default so the grid's dropdowns offer only enabled options; the
  // master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ApurementOptionListQuery = z.infer<typeof apurementOptionListQuerySchema>;
