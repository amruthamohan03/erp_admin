import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { formFieldMaster } from './forms';
import { roleMaster } from './roles';
import { usersT } from './users';

// Field-level role grants. A row here overrides the default ("edit") for one
// (field, role); absence means the role can edit the field.
//
// `permission`:
//   view   — field rendered read-only for the role; server rejects writes
//   edit   — field editable (the default; explicit row not required)
//   hidden — field stripped from form GET responses and from any writes
//
// Adapted from the main-branch design (master_page_accordion_field_role_t)
// per session porting plan. Differences from main:
//   * No accordion layer to clamp against — forms here go straight from
//     form_definition → form_field. Permission is direct, not cascaded.
//   * 'edit' is the default; absence of a row means the role can edit, so
//     enforcement code can treat a missing row identically to permission='edit'.
//
// Composite UNIQUE(field_id, role_id) is enforced — one effective permission
// per (field, role) pair. ON DELETE CASCADE on both FKs so dropping a field
// or a role doesn't strand orphan grants.

export const formFieldRoleGrant = pgTable(
  'form_field_role_t',
  {
    id: serial('id').primaryKey(),
    fieldId: integer('field_id')
      .notNull()
      .references(() => formFieldMaster.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    permission: varchar('permission', { length: 10 }).notNull(),
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
  },
  (t) => ({
    fieldRoleUq: uniqueIndex('uq_form_field_role_t').on(t.fieldId, t.roleId),
    permissionCheck: check(
      'form_field_role_t_permission_check',
      sql`${t.permission} IN ('view', 'edit', 'hidden')`,
    ),
  }),
);

export const formFieldRoleGrantRelations = relations(
  formFieldRoleGrant,
  ({ one }) => ({
    field: one(formFieldMaster, {
      fields: [formFieldRoleGrant.fieldId],
      references: [formFieldMaster.id],
    }),
    role: one(roleMaster, {
      fields: [formFieldRoleGrant.roleId],
      references: [roleMaster.id],
    }),
  }),
);

export type FormFieldRoleGrantRow = typeof formFieldRoleGrant.$inferSelect;
export type FormFieldRoleGrantInsert = typeof formFieldRoleGrant.$inferInsert;
