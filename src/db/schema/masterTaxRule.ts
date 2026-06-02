// STUB — NOT YET WIRED UP. NO MIGRATION. NOT EXPORTED FROM src/db/schema/index.ts.
//
// This file exists to mark the planned destination for the five tax-rate fields
// currently embedded in hscode_master_t (ddi, ica, dci, dcl, tpi). Per CLAUDE.md §4.2,
// tax rules belong in master_tax_rule + the rule engine, not in a flat master.
//
// When this is wired up:
//   1. Generate a migration that creates this table.
//   2. Backfill rows from hscode_master_t (one row per (hscode, rate_code) pair).
//   3. Drop the five rate columns from hscode_master_t and replace the UI editor
//      with a child-list editor that reads/writes master_tax_rule.
//   4. Update Fiche de Calcul to evaluate rates via evaluateRule() instead of
//      reading hscode_master_t columns directly.
//   5. Add this file to src/db/schema/index.ts.
//
// Do not import this file from runtime code yet — it has no table behind it.
import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { hscodeMaster } from './hscodeMaster';

export const masterTaxRule = pgTable('master_tax_rule_t', {
  id: serial('id').primaryKey(),
  hscodeId: integer('hscode_id')
    .notNull()
    .references(() => hscodeMaster.id),
  // 'ddi' | 'ica' | 'dci' | 'dcl' | 'tpi' — and any future rate codes the rule engine adds.
  rateCode: varchar('rate_code', { length: 20 }).notNull(),
  rateValue: numeric('rate_value', { precision: 8, scale: 4 }).notNull().default('0.0000'),
  // Optional time-bounded rates. NULL on either side means "no bound".
  effectiveFrom: timestamp('effective_from', { withTimezone: false }),
  effectiveTo: timestamp('effective_to', { withTimezone: false }),
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

export type MasterTaxRuleRow = typeof masterTaxRule.$inferSelect;
export type MasterTaxRuleInsert = typeof masterTaxRule.$inferInsert;
