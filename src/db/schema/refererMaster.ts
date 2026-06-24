import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Referrer catalogue — the source / introducer that brought a
// client to the company ("Direct", "Agent X", "Trade show 2024").
// Picked on client onboarding for marketing attribution.
//
// Note: main's column was `refferer_name` (double-f typo). Fixed
// here to `referer_name` — single source of truth on the new branch.

export const refererMaster = pgTable('referer_master_t', {
  id: serial('id').primaryKey(),
  refererName: varchar('referer_name', { length: 255 }).notNull(),
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

export type RefererMasterRow = typeof refererMaster.$inferSelect;
export type RefererMasterInsert = typeof refererMaster.$inferInsert;
