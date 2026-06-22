import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Transit point — every customs touchpoint along a consignment's route.
// One row per physical point (port, border crossing, warehouse). The six
// boolean flags say which roles the point can play:
//   entry_point   — point of entry into the country
//   exit_point    — point of exit out of the country
//   loading       — where goods are loaded
//   destination   — final destination
//   warehouse     — bonded / non-bonded storage
//   location      — generic location pin (used when none of the others fit)
//
// imports_t / exports_t reference this via multiple FKs (entry_point_id,
// border_warehouse_id, bonded_warehouse_id, etc.). The flags let the UI
// filter the picker per-field — when picking entry_point on an import,
// show only rows with entry_point=true.

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

export type TransitPointMasterRow = typeof transitPointMaster.$inferSelect;
export type TransitPointMasterInsert = typeof transitPointMaster.$inferInsert;
