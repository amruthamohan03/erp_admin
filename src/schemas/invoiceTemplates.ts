import { z } from 'zod';
import { LAYOUT_KEYS, templateOptionsSchema } from '@/lib/invoiceTemplates/types';

// Body shapes for invoice_template_master_t — the invoice PDF designs (§4.1).

/**
 * The code stored on the invoice itself.
 *
 * Capped at 5 characters because that is what `import_invoices_t.invoice_template`
 * holds; a longer code would be silently truncated by Postgres and the invoice
 * would then reprint with the wrong design, or with none.
 */
const templateCode = z
  .string()
  .min(1, 'Enter a short code for this template, for example MODB.')
  .max(5, 'The code must be 5 characters or fewer — it is stored on each invoice.')
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => /^[A-Z0-9-]+$/u.test(v), {
    message: 'A code may contain only letters, digits and hyphens.',
  });

const layout = z.enum(LAYOUT_KEYS, {
  errorMap: () => ({
    message: `Choose a layout: ${LAYOUT_KEYS.join(' or ')}.`,
  }),
});

export const invoiceTemplateCreateSchema = z.object({
  template_code: templateCode,
  template_name: z
    .string()
    .min(1, 'Template Name is required.')
    .max(100, 'Template Name must be 100 characters or fewer.'),
  description: z.string().max(255, 'The description must be 255 characters or fewer.').nullish(),
  layout,
  options: templateOptionsSchema.default({}),
  is_default: z.boolean().default(false),
});
export type InvoiceTemplateCreateInput = z.infer<typeof invoiceTemplateCreateSchema>;

export const invoiceTemplateUpdateSchema = z.object({
  template_code: templateCode.optional(),
  template_name: z
    .string()
    .min(1, 'Template Name is required.')
    .max(100, 'Template Name must be 100 characters or fewer.')
    .optional(),
  description: z.string().max(255, 'The description must be 255 characters or fewer.').nullish(),
  layout: layout.optional(),
  options: templateOptionsSchema.optional(),
  is_default: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type InvoiceTemplateUpdateInput = z.infer<typeof invoiceTemplateUpdateSchema>;

export const invoiceTemplateListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceTemplateListQuery = z.infer<typeof invoiceTemplateListQuerySchema>;

/**
 * The preview request — a template that need not be saved yet.
 *
 * The master previews what is on screen, including unsaved edits, so the
 * operator sees the effect of a colour change before committing it. `options`
 * arrives as a JSON string because this is a GET the iframe loads by URL.
 */
export const invoiceTemplatePreviewQuerySchema = z.object({
  layout: layout.default('classic'),
  options: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return {};
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'The template options could not be read — they are not valid JSON.',
        });
        return z.NEVER;
      }
    })
    .pipe(templateOptionsSchema),
});
export type InvoiceTemplatePreviewQuery = z.infer<typeof invoiceTemplatePreviewQuerySchema>;
