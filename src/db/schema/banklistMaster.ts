import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Registered bank catalogue (BCC, Rawbank, Equity BCDC, …). Picked
// on invoice / payment-request forms when capturing where money is
// going to or coming from.
//
// `for_exchange` flags banks that are sources for the daily exchange
// rate read into `bank_exchange_rate_t` — distinct from "banks the
// client transacts through". Adapted from main's Y/N flag to a proper
// boolean per the branch convention (matches transit_point /
// expense_type flag patterns).
//
// bank_code is unique among non-soft-deleted rows — same partial-
// unique-by-display-Y treatment as imports.mca_ref.

export const banklistMaster = pgTable(
  'banklist_master_t',
  {
    id: serial('id').primaryKey(),
    bankName: varchar('bank_name', { length: 200 }).notNull(),
    bankCode: varchar('bank_code', { length: 20 }).notNull(),
    forExchange: boolean('for_exchange').notNull().default(false),
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
    bankCodeUq: uniqueIndex('uq_banklist_master_t_bank_code').on(t.bankCode),
  }),
);

export type BanklistMasterRow = typeof banklistMaster.$inferSelect;
export type BanklistMasterInsert = typeof banklistMaster.$inferInsert;
