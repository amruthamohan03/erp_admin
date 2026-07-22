import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Main office — the regional/head office that owns a seal purchase batch.
//
// Adapted from main-branch `main_office_master_t`. Distinct from
// `sub_office_master_t` (the customs declaration desk) and from
// `office_location_master_t` (the client's issuing/reporting office).
// Referenced by seal_batch_t.office_location_id.

export const mainOfficeMaster = pgTable('main_office_master_t', {
  id: serial('id').primaryKey(),
  mainLocationName: varchar('main_location_name', { length: 255 }),
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

export type MainOfficeMasterRow = typeof mainOfficeMaster.$inferSelect;
export type MainOfficeMasterInsert = typeof mainOfficeMaster.$inferInsert;
