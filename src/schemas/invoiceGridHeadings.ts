import { z } from 'zod';
import { GRID_KEYS } from '@/lib/invoiceGrid/columns';

// Body shape for invoice_grid_heading_master_t (§4.1).
//
// Saved as a SET rather than a row at a time: the master screen edits one
// grid's whole header line, and an operator renaming three columns means one
// save and one transaction — not three requests, any of which could land while
// the others fail (§4.17's reasoning applied to a master screen).

const gridKey = z.enum(GRID_KEYS, {
  errorMap: () => ({ message: `Choose a grid: ${GRID_KEYS.join(', ')}.` }),
});

export const invoiceGridHeadingSaveSchema = z.object({
  grid_key: gridKey,
  // NULL = the heading every category using this grid gets.
  category_id: z.coerce.number().int().positive().nullish(),
  headings: z
    .array(
      z.object({
        column_key: z
          .string()
          .min(1, 'A column key is required.')
          .max(30, 'A column key must be 30 characters or fewer.'),
        heading: z
          .string()
          .max(60, 'A heading must be 60 characters or fewer.')
          // Blank is allowed and means "use the built-in name" — the resolver
          // treats it as unconfigured rather than leaving a nameless column.
          .transform((v) => v.trim()),
      }),
    )
    .min(1, 'At least one column heading is required.'),
});
export type InvoiceGridHeadingSaveInput = z.infer<typeof invoiceGridHeadingSaveSchema>;

export const invoiceGridHeadingQuerySchema = z.object({
  category_id: z.coerce.number().int().positive().nullish(),
});
export type InvoiceGridHeadingQuery = z.infer<typeof invoiceGridHeadingQuerySchema>;
