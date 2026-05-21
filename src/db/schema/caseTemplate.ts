import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { formDefinitionMaster } from './forms';
import { workflowMaster } from './workflow';

// Case template per root CLAUDE.md §4.3.
//
// A case template is the glue between a form definition (§4.5), a workflow
// (§4.6), and a target table. Adding a new case type (license, invoice,
// payment_request, …) is supposed to be a config row here, not a new
// module folder — the generic case runtime in src/modules/case-runtime/
// reads this template and orchestrates form rendering, validation, and
// state transitions.
//
// `entity_type` mirrors what form_definition_master_t and workflow_master_t
// declare; the runtime asserts they line up.
//
// `target_table` is the physical Postgres table where instances live (e.g.
// 'license_t', 'invoice_t'). There is no generic case_instance_t — each
// entity gets its own table so domain queries stay readable.

export const caseTemplateMaster = pgTable('case_template_master_t', {
  id: serial('id').primaryKey(),
  templateKey: varchar('template_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  formId: integer('form_id')
    .notNull()
    .references(() => formDefinitionMaster.id, { onDelete: 'restrict' }),
  workflowId: integer('workflow_id')
    .notNull()
    .references(() => workflowMaster.id, { onDelete: 'restrict' }),
  // Physical table that holds case instances (e.g. 'license_t', 'invoice_t').
  targetTable: varchar('target_table', { length: 100 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const caseTemplateMasterRelations = relations(caseTemplateMaster, ({ one }) => ({
  form: one(formDefinitionMaster, {
    fields: [caseTemplateMaster.formId],
    references: [formDefinitionMaster.id],
  }),
  workflow: one(workflowMaster, {
    fields: [caseTemplateMaster.workflowId],
    references: [workflowMaster.id],
  }),
}));

export type CaseTemplateRow = typeof caseTemplateMaster.$inferSelect;
export type CaseTemplateInsert = typeof caseTemplateMaster.$inferInsert;
