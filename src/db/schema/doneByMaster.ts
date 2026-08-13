import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

// "Done by" attribution catalogue — short name strings used on
// operational tracking entries to record which team / external party
// performed a step. Adapted from main's `done_by_t` to the
// `_master_t` naming convention.
//
// The `done_by_name` is unique — the picker shows one row per
// distinct attribution.
//
// One row stands for the operating company itself ("us", as opposed to the
// client). That row is marked `is_company` and RENDERS AS THE CONFIGURED PROJECT
// NAME rather than as its stored text, so Liquidation Paid By / License Cleared
// By / License Submitted To Bank read "Client" vs the deployment's own name
// instead of a hardcoded "Malabar" (§4.1 — identity is configuration).
// See src/lib/doneByLabel.ts for the single resolver.

export const doneByMaster = pgTable('done_by_master_t', {
  id: serial('id').primaryKey(),
  doneByName: varchar('done_by_name', { length: 50 }).notNull().unique(),
  // At most one row may carry this — enforced by a partial unique index below.
  isCompany: boolean('is_company').notNull().default(false),
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
}, (t) => ({
  // "At most one company row": unique over the constant `true`, restricted to the
  // rows that set it. Two rows claiming to be the company would make the resolved
  // label ambiguous.
  companyUq: uniqueIndex('uq_done_by_master_t_is_company')
    .on(t.isCompany)
    .where(sql`${t.isCompany}`),
}));

export type DoneByMasterRow = typeof doneByMaster.$inferSelect;
export type DoneByMasterInsert = typeof doneByMaster.$inferInsert;
