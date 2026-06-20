import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Quotation kinds — the type of clearance the quotation is for.
// E.g. "Import Definitive", "Import Temporary", "Export". The kind name
// drives which math path in src/lib/quotations/compute.ts runs (Export
// uses different totals; Import Definitive switches the customs category
// to CDF columns).
//
// Adapted from main. Added explicit FK references on the audit columns
// (main left them as bare integers) to match this branch's convention.

export const kindMaster = pgTable('kind_master_t', {
  id: serial('id').primaryKey(),
  kindName: varchar('kind_name', { length: 100 }).notNull(),
  kindShortName: varchar('kind_short_name', { length: 20 }).notNull(),
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

export type KindMasterRow = typeof kindMaster.$inferSelect;
export type KindMasterInsert = typeof kindMaster.$inferInsert;
