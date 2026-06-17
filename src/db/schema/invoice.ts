import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clientMaster } from './clients';
import { licenseT } from './license';
import { usersT } from './users';

// Invoice entity per root CLAUDE.md §2 step 4 — issued against a client,
// optionally linked back to the originating license that triggered it.
//
// Transactional table (not _master_t). state holds a status_master_t.status_key
// for entity_type='invoice'. The case-runtime advances state via the
// 'invoice_default' workflow seeded in src/db/seed/invoiceWorkflow.ts.
//
// invoice_number is allocated by the caller, not auto-generated, for the
// same reasons as license_no — jurisdictions have their own numbering rules.

export const invoiceT = pgTable('invoice_t', {
  id: serial('id').primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 100 }).notNull().unique(),
  clientId: integer('client_id')
    .notNull()
    .references(() => clientMaster.id, { onDelete: 'restrict' }),
  // Nullable so standalone invoices (not tied to a customs-clearance
  // consignment) are still representable.
  licenseId: integer('license_id').references(() => licenseT.id, {
    onDelete: 'set null',
  }),
  state: varchar('state', { length: 50 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  tax: numeric('tax', { precision: 18, scale: 2 }),
  totalAmount: numeric('total_amount', { precision: 18, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull(),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  paidAt: timestamp('paid_at', { withTimezone: false }),
  notes: text('notes'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const invoiceRelations = relations(invoiceT, ({ one }) => ({
  client: one(clientMaster, {
    fields: [invoiceT.clientId],
    references: [clientMaster.id],
  }),
  license: one(licenseT, {
    fields: [invoiceT.licenseId],
    references: [licenseT.id],
  }),
}));

export type InvoiceRow = typeof invoiceT.$inferSelect;
export type InvoiceInsert = typeof invoiceT.$inferInsert;
