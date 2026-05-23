import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const currencyMaster = pgTable('currency_master_t', {
  id: serial('id').primaryKey(),
  currencyName: varchar('currency_name', { length: 100 }).notNull(),
  currencyShortName: varchar('currency_short_name', { length: 10 }).notNull(),
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

export type CurrencyMasterRow = typeof currencyMaster.$inferSelect;
export type CurrencyMasterInsert = typeof currencyMaster.$inferInsert;
