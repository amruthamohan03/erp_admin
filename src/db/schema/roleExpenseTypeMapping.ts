import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { roleMaster } from './roles';
import { usersT } from './users';
import { expenseTypeMaster } from './expenseTypeMaster';

// §4.1 — which expense types a role may file a Payment Request against.
//
// Master-driven rather than coded: the expense type decides which MCA
// references are claimable (they map one-to-one), so "who may spend against
// what" is a business decision an administrator changes in the browser, not a
// list in a route handler.
//
// A role with NO rows here is unrestricted. That is deliberate: an empty
// mapping table must not lock every operator out of the expense-type picker on
// the day the feature ships, and 50 roles × 42 expense types of pre-seeded rows
// would be worse. Restriction is opt-in, per role.

export const roleExpenseTypeMapping = pgTable(
  'role_expense_type_mapping_t',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    expenseTypeId: integer('expense_type_id')
      .notNull()
      .references(() => expenseTypeMaster.id, { onDelete: 'cascade' }),
    isAllowed: boolean('is_allowed').notNull().default(true),
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
    roleExpenseTypeUq: uniqueIndex('role_expense_type_mapping_role_type_uq').on(
      t.roleId,
      t.expenseTypeId,
    ),
  }),
);

export const roleExpenseTypeMappingRelations = relations(
  roleExpenseTypeMapping,
  ({ one }) => ({
    role: one(roleMaster, {
      fields: [roleExpenseTypeMapping.roleId],
      references: [roleMaster.id],
    }),
    expenseType: one(expenseTypeMaster, {
      fields: [roleExpenseTypeMapping.expenseTypeId],
      references: [expenseTypeMaster.id],
    }),
    creator: one(usersT, {
      fields: [roleExpenseTypeMapping.createdBy],
      references: [usersT.id],
      relationName: 'role_expense_type_mapping_created_by',
    }),
    updater: one(usersT, {
      fields: [roleExpenseTypeMapping.updatedBy],
      references: [usersT.id],
      relationName: 'role_expense_type_mapping_updated_by',
    }),
  }),
);

export type RoleExpenseTypeMappingRow = typeof roleExpenseTypeMapping.$inferSelect;
export type RoleExpenseTypeMappingInsert = typeof roleExpenseTypeMapping.$inferInsert;
