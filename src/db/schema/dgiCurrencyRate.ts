import {
  pgTable,
  serial,
  varchar,
  numeric,
  date,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// The DGI / e-MCF published currency rate cache, feeding the Bank Exchange Rate
// screen's "fetch BCC" button.
//
// Resolution order, from main's getBccRate(): this table for the requested date
// → a LIVE e-MCF call, but only when the date is TODAY → nothing at all. The
// middle step is restricted because DGI answers with the *current* rate whatever
// you ask for, so using it for a back-dated day would file today's number
// against an older one.
//
// There is deliberately no fall back to the last rate on file. An empty field
// that says why is honest; a stale number sitting in a box labelled "from DGI"
// is not, and it would be saved as though it had been published that day.

export const dgiCurrencyRate = pgTable(
  'dgi_currency_rate_t',
  {
    id: serial('id').primaryKey(),
    currencyCode: varchar('currency_code', { length: 10 }).notNull(),
    rate: numeric('rate', { precision: 14, scale: 4 }).notNull(),
    rateDate: date('rate_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // One rate per currency per day — the conflict target for the cache upsert.
    // On the plain columns, not UPPER(currency_code): ON CONFLICT can only name
    // an expression index if the statement repeats the expression, and Drizzle's
    // onConflictDoUpdate takes columns. The route upper-cases every code before
    // storing it, and a CHECK constraint (0086) stops anything else.
    codeDate: uniqueIndex('uq_dgi_currency_rate_t_code_date').on(
      t.currencyCode,
      t.rateDate,
    ),
  }),
);

export type DgiCurrencyRateRow = typeof dgiCurrencyRate.$inferSelect;
export type DgiCurrencyRateInsert = typeof dgiCurrencyRate.$inferInsert;
