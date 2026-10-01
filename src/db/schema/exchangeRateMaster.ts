import {
  pgTable,
  serial,
  integer,
  date,
  numeric,
  varchar,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { usersT } from './users';
import { currencyMaster } from './currencyMaster';

// §4.1 — the day's reference rates, entered once.
//
// Two numbers that belong to the DAY rather than to any bank: the Banque
// Centrale du Congo publication, and the rate declarations are filed at. Until
// now the BCC was typed again on every bank row of the board — the same figure
// stored n times, which is n chances for them to disagree — and the declaration
// rate had nowhere to live at all.
//
// The board reads this instead of asking for the BCC again (§4.10). It does NOT
// replace the per-row `bank_exchange_rate_t.bcc_rate`: that column is what a
// day was actually saved with and the invoices quoted against, and rewriting
// history to match a master edited later is exactly what it must not do.

export const exchangeRateMaster = pgTable(
  'exchange_rate_master_t',
  {
    id: serial('id').primaryKey(),
    rateDate: date('rate_date').notNull(),
    currencyId: integer('currency_id')
      .notNull()
      .references(() => currencyMaster.id, { onDelete: 'restrict' }),
    // The rate customs declarations are filed at for the day.
    declarationRate: numeric('declaration_rate', { precision: 10, scale: 4 }),
    // What the BCC published that day.
    bccRate: numeric('bcc_rate', { precision: 10, scale: 4 }),
    // §4.27 — a withdrawn day is hidden, never deleted: a board saved against
    // it keeps its own copy of the figures and must stay explicable.
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // One LIVE row per day per currency — two would make "the day's BCC"
    // ambiguous, and the board would take whichever the plan returned first.
    // Partial on display so a withdrawn day frees its slot and can be
    // re-entered, the same rule bank_exchange_rate_t uses.
    uniqueDay: uniqueIndex('uq_exchange_rate_master_day')
      .on(t.rateDate, t.currencyId)
      .where(sql`${t.display} = 'Y'`),
  }),
);

export const exchangeRateMasterRelations = relations(exchangeRateMaster, ({ one }) => ({
  currency: one(currencyMaster, {
    fields: [exchangeRateMaster.currencyId],
    references: [currencyMaster.id],
  }),
}));

export type ExchangeRateMasterRow = typeof exchangeRateMaster.$inferSelect;
export type ExchangeRateMasterInsert = typeof exchangeRateMaster.$inferInsert;
