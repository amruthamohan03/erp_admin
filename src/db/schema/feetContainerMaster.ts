import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Container size catalogue (20-foot, 40-foot, 40-foot HC, …).
// Prereq for `exports_t.feet_container_id` — every container exported
// by sea/road picks its size from this master.

export const feetContainerMaster = pgTable('feet_container_master_t', {
  id: serial('id').primaryKey(),
  feetContainerSize: varchar('feet_container_size', { length: 50 }).notNull(),
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

export type FeetContainerMasterRow = typeof feetContainerMaster.$inferSelect;
export type FeetContainerMasterInsert = typeof feetContainerMaster.$inferInsert;
