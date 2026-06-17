import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clientMaster } from './clients';
import { licenseTypeMaster } from './licenseTypes';
import { usersT } from './users';

// License entity per root CLAUDE.md §2 step 2.
//
// Transactional table (not `_master_t`) — one row per license issued.
// `state` is a string holding a `status_master_t.status_key` value scoped
// to entity_type='license'. Workflow transitions advance this column;
// case-runtime + executeTransition own the rules.
//
// `license_no` is the human-facing identifier shown on documents
// (e.g. 'IB-2026-001'). It's allocated by the caller, not auto-generated,
// because numbering is often jurisdiction-specific.

export const licenseT = pgTable('license_t', {
  id: serial('id').primaryKey(),
  licenseNo: varchar('license_no', { length: 100 }).notNull().unique(),
  clientId: integer('client_id')
    .notNull()
    .references(() => clientMaster.id, { onDelete: 'restrict' }),
  licenseTypeId: integer('license_type_id')
    .notNull()
    .references(() => licenseTypeMaster.id, { onDelete: 'restrict' }),
  // workflow state — string match against status_master_t.status_key for
  // entity_type='license'. Initial value is workflow_master_t.initial_state.
  state: varchar('state', { length: 50 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }),
  currency: varchar('currency', { length: 3 }),
  issueDate: date('issue_date'),
  expiryDate: date('expiry_date'),
  // Populated by the workflow's set_field actions on approval; null until then.
  approvedBy: integer('approved_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: false }),
  notes: varchar('notes', { length: 1000 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const licenseRelations = relations(licenseT, ({ one }) => ({
  client: one(clientMaster, {
    fields: [licenseT.clientId],
    references: [clientMaster.id],
  }),
  licenseType: one(licenseTypeMaster, {
    fields: [licenseT.licenseTypeId],
    references: [licenseTypeMaster.id],
  }),
}));

export type LicenseRow = typeof licenseT.$inferSelect;
export type LicenseInsert = typeof licenseT.$inferInsert;
