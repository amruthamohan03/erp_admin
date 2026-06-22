import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Type of customs clearance — e.g. "Definitive", "Provisional", "Transit
// clearance". imports_t / exports_t carry a types_of_clearance FK.

export const clearanceMaster = pgTable('clearance_master_t', {
  id: serial('id').primaryKey(),
  clearanceName: varchar('clearance_name', { length: 255 }).notNull(),
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

export type ClearanceMasterRow = typeof clearanceMaster.$inferSelect;
export type ClearanceMasterInsert = typeof clearanceMaster.$inferInsert;
