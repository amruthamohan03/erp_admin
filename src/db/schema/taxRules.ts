import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Tax / duty / fee rule master per CLAUDE.md §4.1 — backs Fiche de Calcul
// (§2 step 3, the tracking-phase calculation tool).
//
// Each row carries one calculation formula expressed as JSON Logic (same
// format as rule_master_t.rule_json — see src/engine/rules) so the existing
// applyRule can compute it against any context the caller assembles. The
// distinction from rule_master_t is metadata: tax rules are scoped by
// jurisdiction + category + effective dates, while rule_master_t is for
// generic boolean gates and small derivations.
//
// Example formula — 18 % VAT on an entity's amount:
//   { "*": [{ "var": "entity.amount" }, 0.18] }
//
// scope is a free-form string. Conventional values:
//   import_duty | export_duty | vat | excise | clearance_fee
//
// effective_from / effective_to let rates be replaced without deletion —
// historical recalculations keep working. Either bound can be null (rule is
// open-ended on that side).

export const taxRuleMaster = pgTable('tax_rule_master_t', {
  id: serial('id').primaryKey(),
  ruleKey: varchar('rule_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  jurisdiction: varchar('jurisdiction', { length: 50 }),
  scope: varchar('scope', { length: 50 }),
  formula: jsonb('formula').notNull(),
  effectiveFrom: date('effective_from'),
  effectiveTo: date('effective_to'),
  displayOrder: integer('display_order').notNull().default(0),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type TaxRuleMasterRow = typeof taxRuleMaster.$inferSelect;
export type TaxRuleMasterInsert = typeof taxRuleMaster.$inferInsert;
