import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import type { McaRefSegment } from '@/lib/mcaRefFormat';

// §4.1 — the shape of every auto-generated reference number, as configuration.
//
// One row per reference the app generates. `target_key` is the stable identifier
// code refers to (and the only thing that maps to a table and column, through the
// vetted registry in src/lib/pages/deriveSources.ts) — a config row can never
// name a table itself. `segments` is the ordered list the reference is built
// from; see src/lib/mcaRefFormat.ts for the shape and the renderer.
//
// The set of rows is fixed: adding a seventh reference is a code change, because
// something has to know where to read its codes from. So the setup screen edits
// the six, and there is no create or delete.

export const mcaRefFormatMaster = pgTable('mca_ref_format_master_t', {
  id: serial('id').primaryKey(),
  targetKey: varchar('target_key', { length: 50 }).notNull().unique(),
  formatName: varchar('format_name', { length: 150 }).notNull(),
  segments: jsonb('segments').$type<McaRefSegment[]>().notNull().default([]),
  // 'N' means "fall back to the shipped default" rather than "generate nothing" —
  // a deactivated row must not stop consignments being created.
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type McaRefFormatRow = typeof mcaRefFormatMaster.$inferSelect;
export type McaRefFormatInsert = typeof mcaRefFormatMaster.$inferInsert;
