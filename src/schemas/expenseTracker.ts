import { z } from 'zod';

// Query shape for the expense tracker (§4.29).
//
// The list and the Excel export parse the SAME schema, so a sheet cannot be
// built from fewer filters than the list it exports — §4.15's rule: an export
// of a filtered list must contain the rows that list was showing.

export const expenseTrackerQuerySchema = z.object({
  module: z.enum(['all', 'import', 'export', 'local']).default('all'),
  client_id: z.coerce.number().int().positive().nullish(),
  q: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Dates are YYYY-MM-DD.').nullish(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Dates are YYYY-MM-DD.').nullish(),
  outcome: z.enum(['all', 'profit', 'loss', 'uninvoiced']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type ExpenseTrackerQuery = z.infer<typeof expenseTrackerQuerySchema>;
