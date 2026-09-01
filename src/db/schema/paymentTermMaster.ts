import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Client settlement terms (Advance, 15/30/45/60 Days). Promoted out of the five
// hardcoded `options_static` entries on the Clients page so an operator can add a
// term without a config edit (§4.1).

export const paymentTermMaster = pgTable('payment_term_master_t', {
  id: serial('id').primaryKey(),
  paymentTermName: varchar('payment_term_name', { length: 100 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type PaymentTermMasterRow = typeof paymentTermMaster.$inferSelect;
export type PaymentTermMasterInsert = typeof paymentTermMaster.$inferInsert;
