import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Master table for the rule engine per root CLAUDE.md §4.2.
// Code looks rules up by `rule_key` (a stable string), never by `id` — ids
// drift across deployments. The format of `rule_json` is intentionally
// unspecified at the schema level so the project can pick (JSON Logic, CEL,
// custom DSL) without a migration.
export const ruleMaster = pgTable('rule_master_t', {
  id: serial('id').primaryKey(),
  ruleKey: varchar('rule_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  scope: varchar('scope', { length: 50 }),
  ruleJson: jsonb('rule_json').notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type RuleMasterRow = typeof ruleMaster.$inferSelect;
export type RuleMasterInsert = typeof ruleMaster.$inferInsert;
