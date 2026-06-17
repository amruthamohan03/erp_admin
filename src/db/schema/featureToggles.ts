import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Feature toggle master per CLAUDE.md §4.1 + §10 — "Requests to add a
// feature flag in code → use `feature_toggle_master_t` instead."
//
// Globally-scoped on/off switches. The MVP intentionally leaves out
// per-role / per-user scoping — a `scope` column (or a row-per-role
// override table) is a deliberate follow-up if the project needs targeted
// rollouts. Callers consult `isFeatureEnabled(toggleKey)` from
// src/lib/featureToggles.ts.
//
// display='N' soft-deletes the row, which is treated the same as "not
// configured" — the fallback value the caller passed to isFeatureEnabled
// takes effect.

export const featureToggleMaster = pgTable('feature_toggle_master_t', {
  id: serial('id').primaryKey(),
  toggleKey: varchar('toggle_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type FeatureToggleMasterRow = typeof featureToggleMaster.$inferSelect;
export type FeatureToggleMasterInsert = typeof featureToggleMaster.$inferInsert;
