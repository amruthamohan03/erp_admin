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
import { invoiceT } from './invoice';
import { usersT } from './users';

// Credit note entity per root CLAUDE.md §2 step 5 — reversal / adjustment
// issued against an invoice. Transactional table (no _master_t suffix).
//
// state holds a status_master_t.status_key value for entity_type =
// 'credit_note'. The case-runtime advances state via the
// 'credit_note_default' workflow (seeded in src/db/seed/creditNoteWorkflow.ts):
//   draft → submitted → approved → applied   (happy path — applied is final)
//   {draft, submitted, approved} → cancelled (escape hatch)
//
// invoice_id is required: a credit note must always reference the invoice
// it adjusts. client_id mirrors the invoice's client and is denormalized
// here so list views can filter by client without joining.
//
// applied_at is set by the 'apply' transition via the workflow's set_field
// action with { var: 'now' } — same idiom as invoice_t.paid_at.

export const creditNoteT = pgTable('credit_note_t', {
  id: serial('id').primaryKey(),
  creditNoteNumber: varchar('credit_note_number', { length: 100 })
    .notNull()
    .unique(),
  invoiceId: integer('invoice_id')
    .notNull()
    .references(() => invoiceT.id, { onDelete: 'restrict' }),
  clientId: integer('client_id')
    .notNull()
    .references(() => clientMaster.id, { onDelete: 'restrict' }),
  state: varchar('state', { length: 50 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  reason: text('reason').notNull(),
  issuedDate: date('issued_date'),
  appliedAt: timestamp('applied_at', { withTimezone: false }),
  notes: text('notes'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export const creditNoteRelations = relations(creditNoteT, ({ one }) => ({
  invoice: one(invoiceT, {
    fields: [creditNoteT.invoiceId],
    references: [invoiceT.id],
  }),
  client: one(clientMaster, {
    fields: [creditNoteT.clientId],
    references: [clientMaster.id],
  }),
}));

export type CreditNoteRow = typeof creditNoteT.$inferSelect;
export type CreditNoteInsert = typeof creditNoteT.$inferInsert;
