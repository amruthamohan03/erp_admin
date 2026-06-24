import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// The company's own bank accounts catalogue — the ones that get
// printed on outgoing invoices so clients know where to wire
// payment. Distinct from `banklist_master_t` (which is the registry
// of registered banks in the system, including ones the company
// doesn't itself bank with).
//
// Picked on invoice generation: each invoice carries the
// `invoice_bank_id` it should display in the "remit to" footer.
// Multiple rows are allowed because operators sometimes route
// different currencies through different banks (USD via Rawbank,
// CDF via BCDC).

export const invoiceBankMaster = pgTable('invoice_bank_master_t', {
  id: serial('id').primaryKey(),
  invoiceBankName: varchar('invoice_bank_name', { length: 255 }).notNull(),
  invoiceBankAccountName: varchar('invoice_bank_account_name', {
    length: 255,
  }).notNull(),
  invoiceBankAccountNumber: varchar('invoice_bank_account_number', {
    length: 50,
  }).notNull(),
  invoiceBankSwift: varchar('invoice_bank_swift', { length: 20 }),
  invoiceBankAddress: text('invoice_bank_address'),
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

export type InvoiceBankMasterRow = typeof invoiceBankMaster.$inferSelect;
export type InvoiceBankMasterInsert = typeof invoiceBankMaster.$inferInsert;
