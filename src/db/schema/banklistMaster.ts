import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';

export const banklistMaster = pgTable('banklist_master_t', {
  id: serial('id').primaryKey(),
  bankName: varchar('bank_name', { length: 200 }).notNull(),
  bankCode: varchar('bank_code', { length: 20 }).notNull(),
  forExchange: varchar('for_exchange', { length: 1 }).notNull().default('N'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type BanklistMasterRow = typeof banklistMaster.$inferSelect;
export type BanklistMasterInsert = typeof banklistMaster.$inferInsert;
