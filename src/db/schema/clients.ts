import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Client master per root CLAUDE.md §2 step 1 (client onboarding).
//
// Every consignment in the ERP — license, tracking run, invoice, payment
// request — is owned by exactly one client. client_code is the stable
// human-friendly identifier used on customs paperwork and references.
// name is the operating name; legal_name is the formal entity name for
// invoices/tax filings (often the same; nullable when they match).

export const clientMaster = pgTable('client_master_t', {
  id: serial('id').primaryKey(),
  clientCode: varchar('client_code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  legalName: varchar('legal_name', { length: 255 }),
  email: varchar('email', { length: 100 }),
  phone: varchar('phone', { length: 30 }),
  address: text('address'),
  taxId: varchar('tax_id', { length: 50 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type ClientMasterRow = typeof clientMaster.$inferSelect;
export type ClientMasterInsert = typeof clientMaster.$inferInsert;
