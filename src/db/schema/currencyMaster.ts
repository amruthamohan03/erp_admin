import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Currency master — currencies the quotation system can express line items
// in (USD, EUR, CDF, …). Distinct from the existing iso.currency_code
// validation in field_validation_master_t: this is a real table the FK
// chain (quotation_items.currency_id) needs, with display + soft-delete +
// audit cols. Seed it with the same set the validation enforces so the
// two stay consistent until a future slice unifies them.

export const currencyMaster = pgTable('currency_master_t', {
  id: serial('id').primaryKey(),
  currencyName: varchar('currency_name', { length: 100 }).notNull(),
  currencyShortName: varchar('currency_short_name', { length: 10 }).notNull(),
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

export type CurrencyMasterRow = typeof currencyMaster.$inferSelect;
export type CurrencyMasterInsert = typeof currencyMaster.$inferInsert;
