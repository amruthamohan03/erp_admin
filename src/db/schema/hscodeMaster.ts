import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  numeric,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Harmonized System (HS) code catalogue. Each row is one tariff entry
// with five DRC customs-tax rate columns:
//   * ddi  — Droits de Douane à l'Importation (import duty)
//   * ica  — Impôt sur le Chiffre d'Affaires à l'Importation (sales)
//   * dci  — Droits de Consommation (excise on certain goods)
//   * dcl  — Droits de Sortie (export duty)
//   * tpi  — Taxe de Promotion de l'Industrie (industry promotion)
//
// Stored as numeric(5,2) percent rates (e.g. `10.00` = 10%). Default
// to 0 so a row created for HS-code lookup before the rates are set
// doesn't break Fiche de Calcul math.
//
// TODO(rule-engine): per CLAUDE.md §4.2 these rates are tax rules and
// belong in `tax_rule_master_t` (JSON Logic formulas keyed by HS code).
// Keeping them inline for now matches the source schema and lets
// non-technical operators edit rates on the HS code form directly;
// migration to the rule engine becomes a structural rewrite when
// Fiche de Calcul needs the math configurable beyond flat rates.

export const hscodeMaster = pgTable('hscode_master_t', {
  id: serial('id').primaryKey(),
  hscodeNumber: varchar('hscode_number', { length: 100 }).notNull(),
  hscodeDdi: numeric('hscode_ddi', { precision: 5, scale: 2 }).default('0.00'),
  hscodeIca: numeric('hscode_ica', { precision: 5, scale: 2 }).default('0.00'),
  hscodeDci: numeric('hscode_dci', { precision: 5, scale: 2 }).default('0.00'),
  hscodeDcl: numeric('hscode_dcl', { precision: 5, scale: 2 }).default('0.00'),
  hscodeTpi: numeric('hscode_tpi', { precision: 5, scale: 2 }).default('0.00'),
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

export type HscodeMasterRow = typeof hscodeMaster.$inferSelect;
export type HscodeMasterInsert = typeof hscodeMaster.$inferInsert;
