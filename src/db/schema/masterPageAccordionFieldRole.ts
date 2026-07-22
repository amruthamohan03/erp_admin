// §4.14 — field-level role grants, layered on top of accordion grants (§4.12).
// A row here OVERRIDES the accordion permission for one (field, role); absence
// means the field inherits its accordion's permission for that role.
//
// `permission`:
//   view   — field rendered read-only for the role
//   edit   — field editable (clamped: never more than the accordion's grant)
//   hidden — field not sent to the client / not writable
import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { masterPageAccordionField } from './masterPageAccordionField';
import { roleMaster } from './roles';
import { usersT } from './users';

export const masterPageAccordionFieldRole = pgTable(
  'master_page_accordion_field_role_t',
  {
    id: serial('id').primaryKey(),
    fieldId: integer('field_id')
      .notNull()
      .references(() => masterPageAccordionField.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    // CHECK constraint in migration restricts to view | edit | hidden.
    permission: varchar('permission', { length: 10 }).notNull(),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    fieldRoleUq: uniqueIndex('uq_master_page_accordion_field_role_t').on(t.fieldId, t.roleId),
  }),
);

export const masterPageAccordionFieldRoleRelations = relations(
  masterPageAccordionFieldRole,
  ({ one }) => ({
    field: one(masterPageAccordionField, {
      fields: [masterPageAccordionFieldRole.fieldId],
      references: [masterPageAccordionField.id],
    }),
    role: one(roleMaster, {
      fields: [masterPageAccordionFieldRole.roleId],
      references: [roleMaster.id],
    }),
  }),
);

export type MasterPageAccordionFieldRoleRow = typeof masterPageAccordionFieldRole.$inferSelect;
export type MasterPageAccordionFieldRoleInsert = typeof masterPageAccordionFieldRole.$inferInsert;
