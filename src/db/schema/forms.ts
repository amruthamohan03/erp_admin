import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';

// Dynamic forms tables per root CLAUDE.md §4.5.
//
// A form definition belongs to an entity type (e.g. 'license', 'invoice') and
// is composed of an ordered list of fields. The same form can serve create
// and edit flows — the case-runtime (§4.3) decides which fields to enable
// per case state via the workflow engine.
//
// `field_type` is a stable string (text, number, date, select, etc.) — the
// renderer maps it to a React component. We don't constrain it at the DB
// level so new types can be added without a migration; the runtime is the
// source of truth for what's actually supported.
//
// `validation_json` and `options_json` shapes are intentionally undecided —
// fail-loud renderer below until the format is picked alongside the first
// real form.

export const formDefinitionMaster = pgTable('form_definition_master_t', {
  id: serial('id').primaryKey(),
  formKey: varchar('form_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // Which entity this form binds to (e.g. 'license', 'invoice').
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const formFieldMaster = pgTable('form_field_master_t', {
  id: serial('id').primaryKey(),
  formId: integer('form_id')
    .notNull()
    .references(() => formDefinitionMaster.id, { onDelete: 'cascade' }),
  fieldKey: varchar('field_key', { length: 100 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  // text / textarea / number / email / password / date / datetime /
  // select / multiselect / checkbox / file / reference / hidden, …
  // Renderer enumerates the supported set.
  fieldType: varchar('field_type', { length: 50 }).notNull(),
  required: boolean('required').notNull().default(false),
  defaultValue: text('default_value'),
  helpText: text('help_text'),
  // Per-field validation rules — Zod-like or custom. Format chosen by renderer.
  validationJson: jsonb('validation_json'),
  // For select/multiselect/reference: option source or option list.
  optionsJson: jsonb('options_json'),
  displayOrder: integer('display_order').notNull().default(0),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const formDefinitionMasterRelations = relations(formDefinitionMaster, ({ many }) => ({
  fields: many(formFieldMaster),
}));

export const formFieldMasterRelations = relations(formFieldMaster, ({ one }) => ({
  form: one(formDefinitionMaster, {
    fields: [formFieldMaster.formId],
    references: [formDefinitionMaster.id],
  }),
}));

export type FormDefinitionRow = typeof formDefinitionMaster.$inferSelect;
export type FormDefinitionInsert = typeof formDefinitionMaster.$inferInsert;
export type FormFieldRow = typeof formFieldMaster.$inferSelect;
export type FormFieldInsert = typeof formFieldMaster.$inferInsert;
