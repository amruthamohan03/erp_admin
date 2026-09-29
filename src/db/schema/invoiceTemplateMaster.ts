import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import type { LayoutKey, TemplateOptions } from '@/lib/invoiceTemplates/types';

// §4.1 — the invoice PDF designs, as rows an operator maintains.
//
// `layout` names one of a VETTED set the renderer can draw (§4.33's rule: config
// names a vetted thing, never arbitrary code), and `options` carries everything
// that layout reads — colour, title, tagline, terms, footer, which blocks show.
// Two house styles in the same layout and different colours are two rows, not
// two code paths.
//
// `template_code` is what lands in `import_invoices_t.invoice_template`
// (varchar(5)), so the invoice records WHICH design it was drawn with and can
// be reprinted identically later. The select stores the code rather than the
// row id via `props.optionsValueField`.

export const invoiceTemplateMaster = pgTable('invoice_template_master_t', {
  id: serial('id').primaryKey(),
  templateCode: varchar('template_code', { length: 5 }).notNull(),
  templateName: varchar('template_name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  layout: varchar('layout', { length: 30 }).notNull().$type<LayoutKey>(),
  options: jsonb('options').$type<TemplateOptions>().notNull().default({}),
  // The one a new invoice starts on when nothing else picks a template. At most
  // one row may hold it — a partial unique index enforces that, because "two
  // defaults" resolves to whichever the query happened to return first.
  isDefault: boolean('is_default').notNull().default(false),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type InvoiceTemplateRow = typeof invoiceTemplateMaster.$inferSelect;
export type InvoiceTemplateInsert = typeof invoiceTemplateMaster.$inferInsert;
