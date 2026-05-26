// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `invoice_bank_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const invoiceBankMaster = pgTable('invoice_bank_master_t', {
  id: serial('id').primaryKey(),
  invoiceBankName: varchar('invoice_bank_name', { length: 255 }).notNull(),
  invoiceBankAccountName: varchar('invoice_bank_account_name', { length: 255 }).notNull(),
  invoiceBankAccountNumber: varchar('invoice_bank_account_number', { length: 50 }).notNull(),
  invoiceBankSwift: varchar('invoice_bank_swift', { length: 20 }),
  invoiceBankAddress: text('invoice_bank_address'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type InvoiceBankMasterRow = typeof invoiceBankMaster.$inferSelect;
export type InvoiceBankMasterInsert = typeof invoiceBankMaster.$inferInsert;
