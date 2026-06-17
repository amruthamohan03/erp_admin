import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Field validation master per CLAUDE.md §4.1.
//
// Catalogues reusable regex validations — `validation_key` is the stable
// identifier admins reference from `form_field_master_t.validation_json`
// (or anywhere else that runs string checks). The point is to keep "what
// counts as a valid DRC phone / TIN / hs_code" in one place so a project-
// wide change is one row update, not a hunt across form rows.
//
// Two seeded conventions worth following:
//   * `<jurisdiction>.<kind>` — `drc.phone`, `drc.tin`, `iso.country_code`
//   * one regex per row — composing rules belongs in the rule engine, not
//     here. `pattern` is a Postgres-native string and is consumed by the
//     JavaScript RegExp constructor unchanged.
//
// `error_message` is what the UI shows when the value doesn't match. It's
// optional; callers can fall back to a generic "<name> doesn't match".

export const fieldValidationMaster = pgTable('field_validation_master_t', {
  id: serial('id').primaryKey(),
  validationKey: varchar('validation_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  pattern: text('pattern').notNull(),
  errorMessage: varchar('error_message', { length: 255 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type FieldValidationMasterRow = typeof fieldValidationMaster.$inferSelect;
export type FieldValidationMasterInsert = typeof fieldValidationMaster.$inferInsert;
