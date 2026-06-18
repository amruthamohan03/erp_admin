import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { formDefinitionMaster } from './forms';
import { usersT } from './users';

// Report definition master per CLAUDE.md §2 step 7 (reporting). One row
// per addressable report; presentation metadata only.
//
// The actual query for each report lives in src/reports/handlers/<key>.ts
// — runReport(reportKey) loads this row for metadata + Zod-validates the
// caller's parameters via the linked form_definition, then dispatches to
// the matching code-side handler. SQL stays in versioned code; the master
// table controls visibility (display='Y'), ordering, labels, categories,
// and column metadata.
//
// formId (nullable) → form_definition_master_t.id. Reuses the existing
// form_field_master_t + buildFormZodSchema infrastructure for parameters
// so we don't grow a parallel "report_parameter_master_t".
//
// columnsJson shape (validated by parseReportColumns in src/lib/reports.ts):
//   [
//     { "key": "state",  "label": "State",  "type": "text",  "align": "left"  },
//     { "key": "count",  "label": "Count",  "type": "number", "align": "right" }
//   ]

export const reportDefinitionMaster = pgTable('report_definition_master_t', {
  id: serial('id').primaryKey(),
  reportKey: varchar('report_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // operations | finance | compliance | … — free-form, the UI groups by it.
  category: varchar('category', { length: 50 }),
  // Optional parameter form. null for parameterless reports.
  formId: integer('form_id').references(() => formDefinitionMaster.id, {
    onDelete: 'restrict',
  }),
  columnsJson: jsonb('columns_json').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
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

export const reportDefinitionRelations = relations(
  reportDefinitionMaster,
  ({ one }) => ({
    form: one(formDefinitionMaster, {
      fields: [reportDefinitionMaster.formId],
      references: [formDefinitionMaster.id],
    }),
  }),
);

export type ReportDefinitionMasterRow =
  typeof reportDefinitionMaster.$inferSelect;
export type ReportDefinitionMasterInsert =
  typeof reportDefinitionMaster.$inferInsert;
