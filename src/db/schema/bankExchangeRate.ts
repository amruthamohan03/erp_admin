import {
  pgTable,
  serial,
  integer,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { banklistMaster } from './banklistMaster';
import { currencyMaster } from './currencyMaster';

// Bank exchange rate history — one row per bank × currency × date.
// The bcc_rate column captures the Banque Centrale du Congo official
// rate for that day (operator copies from the BCC publication); the
// bank_rate is the actual rate the bank used for transactions. Both
// matter because invoice rounding can use either depending on the
// regime.
//
// Transactional, not a master — naming follows `_t` not `_master_t`.
// The bank_id FK is restricted to rows with `for_exchange=true`
// (enforced by the picker, not the DB).
//
// Drops main's redundant `currency_code` varchar column — currency
// short name already lives on currency_master_t and the display
// layer reads it via the FK join.

export const bankExchangeRate = pgTable(
  'bank_exchange_rate_t',
  {
    id: serial('id').primaryKey(),
    bankId: integer('bank_id')
      .notNull()
      .references(() => banklistMaster.id, { onDelete: 'restrict' }),
    exchangeDate: date('exchange_date').notNull(),
    currencyId: integer('currency_id')
      .notNull()
      .references(() => currencyMaster.id, { onDelete: 'restrict' }),
    bccRate: numeric('bcc_rate', { precision: 10, scale: 4 }).default('0.0000'),
    bankRate: numeric('bank_rate', { precision: 10, scale: 4 }).default(
      '0.0000',
    ),
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
  },
  (t) => ({
    // One rate per (bank, currency, date) — no duplicate entries.
    uniqueRate: uniqueIndex('uq_bank_exchange_rate_t_bank_currency_date').on(
      t.bankId,
      t.currencyId,
      t.exchangeDate,
    ),
    dateIdx: index('idx_bank_exchange_rate_t_date').on(t.exchangeDate),
    bankIdx: index('idx_bank_exchange_rate_t_bank').on(t.bankId),
  }),
);

export const bankExchangeRateRelations = relations(
  bankExchangeRate,
  ({ one }) => ({
    bank: one(banklistMaster, {
      fields: [bankExchangeRate.bankId],
      references: [banklistMaster.id],
    }),
    currency: one(currencyMaster, {
      fields: [bankExchangeRate.currencyId],
      references: [currencyMaster.id],
    }),
  }),
);

export type BankExchangeRateRow = typeof bankExchangeRate.$inferSelect;
export type BankExchangeRateInsert = typeof bankExchangeRate.$inferInsert;
