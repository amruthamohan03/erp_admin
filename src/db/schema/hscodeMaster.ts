// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `hscode_master_t`
// because the user asked to mirror the source DB naming exactly.
//
// TODO(rule-engine): the five rate columns (ddi, ica, dci, dcl, tpi) are tax rules
// per CLAUDE.md §4.2 and should eventually move to master_tax_rule keyed by HS code.
// See src/db/schema/masterTaxRule.ts for the stub target. For now we follow the
// source schema and let users edit rates inline on the HS code form.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  numeric,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const hscodeMaster = pgTable('hscode_master_t', {
  id: serial('id').primaryKey(),
  hscodeNumber: varchar('hscode_number', { length: 100 }).notNull(),
  hscodeDdi: numeric('hscode_ddi', { precision: 5, scale: 2 }).default('0.00'),
  hscodeIca: numeric('hscode_ica', { precision: 5, scale: 2 }).default('0.00'),
  hscodeDci: numeric('hscode_dci', { precision: 5, scale: 2 }).default('0.00'),
  hscodeDcl: numeric('hscode_dcl', { precision: 5, scale: 2 }).default('0.00'),
  hscodeTpi: numeric('hscode_tpi', { precision: 5, scale: 2 }).default('0.00'),
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

export type HscodeMasterRow = typeof hscodeMaster.$inferSelect;
export type HscodeMasterInsert = typeof hscodeMaster.$inferInsert;
