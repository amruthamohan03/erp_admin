import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// §4.26 — per-action colour and icon, edited under Settings → Application.
//
// The runtime turns these rows into CSS variables that the shared `btn-*` /
// `ico-*` classes read, so restyling an action reaches every screen without a
// deploy. `action_key` is the stable identifier code refers to; `label` is only
// what the settings screen shows.

export const actionStyleMaster = pgTable('action_style_master_t', {
  id: serial('id').primaryKey(),
  actionKey: varchar('action_key', { length: 40 }).notNull().unique(),
  label: varchar('label', { length: 60 }).notNull(),
  // Hex, e.g. '#dc2626'. Validated at the API boundary (§4.23).
  color: varchar('color', { length: 20 }).notNull(),
  // A lucide icon name, e.g. 'Trash2'. Unknown names fall back to the default.
  icon: varchar('icon', { length: 60 }).notNull(),
  displayOrder: integer('display_order').notNull().default(1),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type ActionStyleRow = typeof actionStyleMaster.$inferSelect;
export type ActionStyleInsert = typeof actionStyleMaster.$inferInsert;
