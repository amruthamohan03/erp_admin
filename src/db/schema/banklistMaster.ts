import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

// Registered bank catalogue (BCC, Rawbank, Equity BCDC, …). Picked
// on invoice / payment-request forms when capturing where money is
// going to or coming from.
//
// `for_exchange` flags banks that are sources for the daily exchange
// rate read into `bank_exchange_rate_t` — distinct from "banks the
// client transacts through". Stored as a 'Y'/'N' char to match main.
//
// bank_code is NOT unique. The restructure schema originally declared a unique
// index on it (0031), but production has always used it as a free-text
// placeholder — all 13 banks carry 'N/A' — so the constraint could never be
// applied to the real database and blocked seeding production's bank list.
// 0043 drops it; production's uniqueness lives on bank_name instead, as the
// case-insensitive index uq_banklist_master_t_bank_name_ci.

export const banklistMaster = pgTable(
  'banklist_master_t',
  {
    id: serial('id').primaryKey(),
    bankName: varchar('bank_name', { length: 200 }).notNull(),
    bankCode: varchar('bank_code', { length: 20 }).notNull(),
    forExchange: varchar('for_exchange', { length: 1 }).notNull().default('N'),
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
  },
  (t) => ({
    bankNameUq: uniqueIndex('uq_banklist_master_t_bank_name_ci').on(
      sql`lower(${t.bankName})`,
    ),
  }),
);

export type BanklistMasterRow = typeof banklistMaster.$inferSelect;
export type BanklistMasterInsert = typeof banklistMaster.$inferInsert;
