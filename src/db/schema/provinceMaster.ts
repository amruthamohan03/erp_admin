// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `province_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { originMaster } from './originMaster';

export const provinceMaster = pgTable('province_master_t', {
  id: serial('id').primaryKey(),
  provinceName: varchar('province_name', { length: 255 }).notNull(),
  originId: integer('origin_id')
    .notNull()
    .default(1)
    .references(() => originMaster.id),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type ProvinceMasterRow = typeof provinceMaster.$inferSelect;
export type ProvinceMasterInsert = typeof provinceMaster.$inferInsert;
