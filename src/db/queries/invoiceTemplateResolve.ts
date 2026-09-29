import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceTemplateMaster } from '@/db/schema';
import {
  DEFAULT_TEMPLATE,
  isLayoutKey,
  templateOptionsSchema,
  type InvoiceTemplate,
} from '@/lib/invoiceTemplates/types';

/**
 * The template an invoice prints with.
 *
 * Resolution order, and every step of it is load-bearing:
 *   1. the row whose `template_code` the invoice stored
 *   2. the row flagged `is_default`
 *   3. `DEFAULT_TEMPLATE` — the classic facture, in code
 *
 * §4.33's fallback rule applied to documents: a missing, retired or
 * unrecognised template must never stop an invoice printing, and must never
 * quietly print something DIFFERENT either — so the last resort reproduces
 * exactly what the hardcoded builder produced before templates existed.
 *
 * A soft-deleted template is NOT used even when an invoice names it: retiring a
 * design is a decision, and a reprint should follow the current default rather
 * than resurrect a layout the operator withdrew. The code stays on the invoice
 * either way, so the history of what it was drawn with is not lost (§4.27).
 */
export async function resolveInvoiceTemplate(code: string | null): Promise<InvoiceTemplate> {
  const trimmed = code?.trim() ?? '';

  const [row] = await db
    .select({
      layout: invoiceTemplateMaster.layout,
      options: invoiceTemplateMaster.options,
    })
    .from(invoiceTemplateMaster)
    .where(
      trimmed
        ? and(
            eq(invoiceTemplateMaster.templateCode, trimmed),
            eq(invoiceTemplateMaster.display, 'Y'),
          )
        : and(eq(invoiceTemplateMaster.isDefault, true), eq(invoiceTemplateMaster.display, 'Y')),
    )
    .limit(1);

  // The named code resolved to nothing (retired, or never existed) — fall to
  // the default rather than to the in-code layout, so an operator's configured
  // house style still wins.
  if (!row && trimmed) {
    const [fallback] = await db
      .select({
        layout: invoiceTemplateMaster.layout,
        options: invoiceTemplateMaster.options,
      })
      .from(invoiceTemplateMaster)
      .where(
        and(eq(invoiceTemplateMaster.isDefault, true), eq(invoiceTemplateMaster.display, 'Y')),
      )
      .limit(1);
    return toTemplate(fallback);
  }

  return toTemplate(row);
}

function toTemplate(row: { layout: string; options: unknown } | undefined): InvoiceTemplate {
  if (!row || !isLayoutKey(row.layout)) return DEFAULT_TEMPLATE;
  // Options are parsed rather than trusted: the column is jsonb, so a row
  // edited outside the app could carry anything, and a bad value would reach
  // the renderer as a style attribute. An unparseable bag degrades to the
  // defaults instead of throwing on a document someone is trying to print.
  const parsed = templateOptionsSchema.safeParse(row.options ?? {});
  return { layout: row.layout, options: parsed.success ? parsed.data : {} };
}

/** The default template's code, for prefilling a new invoice's dropdown. */
export async function defaultTemplateCode(): Promise<string | null> {
  const [row] = await db
    .select({ code: invoiceTemplateMaster.templateCode })
    .from(invoiceTemplateMaster)
    .where(and(eq(invoiceTemplateMaster.isDefault, true), eq(invoiceTemplateMaster.display, 'Y')))
    .orderBy(sql`1`)
    .limit(1);
  return row?.code ?? null;
}
