import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  date,
  numeric,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { banklistMaster } from './banklistMaster';
import { currencyMaster } from './currencyMaster';

export const bankExchangeRate = pgTable('bank_exchange_rate_t', {
  id: serial('id').primaryKey(),
  bankId: integer('bank_id')
    .notNull()
    .references(() => banklistMaster.id),
  exchangeDate: date('exchange_date').notNull(),
  currencyId: integer('currency_id')
    .notNull()
    .default(1)
    .references(() => currencyMaster.id),
  currencyCode: varchar('currency_code', { length: 10 }).notNull().default('USD'),
  bccRate: numeric('bcc_rate', { precision: 10, scale: 4 }).default('0.0000'),
  bankRate: numeric('bank_rate', { precision: 10, scale: 4 }).default('0.0000'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type BankExchangeRateRow = typeof bankExchangeRate.$inferSelect;
export type BankExchangeRateInsert = typeof bankExchangeRate.$inferInsert;
