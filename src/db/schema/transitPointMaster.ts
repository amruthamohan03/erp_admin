import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const transitPointMaster = pgTable('transit_point_master_t', {
  id: serial('id').primaryKey(),
  transitPointName: varchar('transit_point_name', { length: 255 }).notNull(),
  entryPoint: boolean('entry_point').notNull().default(true),
  exitPoint: boolean('exit_point').notNull().default(true),
  loading: boolean('loading').notNull().default(true),
  destination: boolean('destination').notNull().default(true),
  warehouse: boolean('warehouse').notNull().default(false),
  location: boolean('location').notNull().default(false),
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

export type TransitPointMasterRow = typeof transitPointMaster.$inferSelect;
export type TransitPointMasterInsert = typeof transitPointMaster.$inferInsert;
