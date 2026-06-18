import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Office master — physical office locations where the company operates.
//
// Adapted from main-branch `main_office_master_t` (which itself flagged a
// TODO to drop the `main_` prefix per §4.1 naming). On this branch there's
// no `sub_office_master_t` to disambiguate against, so we land on the
// cleaner `office_master_t`.
//
// Used by:
//   - seal_nos_t (purchase location for a seal batch)
//   - future: any module that needs a "where did this happen" pin point

export const officeMaster = pgTable('office_master_t', {
  id: serial('id').primaryKey(),
  locationName: varchar('location_name', { length: 255 }).notNull(),
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

export type OfficeMasterRow = typeof officeMaster.$inferSelect;
export type OfficeMasterInsert = typeof officeMaster.$inferInsert;
