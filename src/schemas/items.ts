import { z } from 'zod';

// item_type: 'I' (Import), 'E' (Export), 'U' (Universal), or combinations
// up to 3 chars (IE, IU, EU, IEU). The Quotations compute layer filters
// item lookups by direction so an export quotation only sees E/U/IE/EU/IEU.
const itemTypeSchema = z
  .string()
  .min(1)
  .max(3)
  .regex(/^[IEU]+$/, 'item_type must contain only I, E, U');

export const itemCreateSchema = z.object({
  item_name: z.string().min(1).max(255),
  item_code: z.string().max(50).optional().nullable(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  tax_not_tax: z.string().length(1).default('A'),
  percentage: z.coerce.number().min(0).default(0),
  item_type: itemTypeSchema,
});
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z.object({
  item_name: z.string().min(1).max(255).optional(),
  item_code: z.string().max(50).optional().nullable(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  tax_not_tax: z.string().length(1).optional(),
  percentage: z.coerce.number().min(0).optional(),
  item_type: itemTypeSchema.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemListQuerySchema = z.object({
  q: z.string().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  item_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
