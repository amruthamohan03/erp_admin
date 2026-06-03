// Minimal master for import "partial" references (partial_id on imports_t).
// The source `partial_t` DDL wasn't provided, so this is a minimal id+name
// master; extend the columns if/when the real definition is available.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const partials = pgTable('partial_t', {
  id: serial('id').primaryKey(),
  partialName: varchar('partial_name', { length: 150 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type PartialRow = typeof partials.$inferSelect;
export type PartialInsert = typeof partials.$inferInsert;
