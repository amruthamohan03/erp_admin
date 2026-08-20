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
import { menuMaster } from './menus';
import { usersT } from './users';

export const roleMenuMapping = pgTable(
  'role_menu_mapping_t',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    menuId: integer('menu_id')
      .notNull()
      .references(() => menuMaster.id, { onDelete: 'cascade' }),
    canView: boolean('can_view').notNull().default(false),
    canAdd: boolean('can_add').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
    canApprove: boolean('can_approve').notNull().default(false),
    // §4.27 — three distinct operations, three distinct grants. can_delete only
    // hides a row; undoing that and destroying it are separate decisions.
    canRestore: boolean('can_restore').notNull().default(false),
    canPermanentDelete: boolean('can_permanent_delete').notNull().default(false),

    // §4.14 — the remaining action grants. Export/import/print gate the document
    // buttons; the audit pair is separate because reading the log and taking a
    // copy of it away are different levels of trust (§4.28).
    canExport: boolean('can_export').notNull().default(false),
    canImport: boolean('can_import').notNull().default(false),
    canPrint: boolean('can_print').notNull().default(false),
    canViewAudit: boolean('can_view_audit').notNull().default(false),
    canExportAudit: boolean('can_export_audit').notNull().default(false),
    canManageSettings: boolean('can_manage_settings').notNull().default(false),
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
    roleMenuUq: uniqueIndex('role_menu_mapping_role_menu_uq').on(
      t.roleId,
      t.menuId,
    ),
  }),
);

export const roleMenuMappingRelations = relations(roleMenuMapping, ({ one }) => ({
  role: one(roleMaster, {
    fields: [roleMenuMapping.roleId],
    references: [roleMaster.id],
  }),
  menu: one(menuMaster, {
    fields: [roleMenuMapping.menuId],
    references: [menuMaster.id],
  }),
  creator: one(usersT, {
    fields: [roleMenuMapping.createdBy],
    references: [usersT.id],
    relationName: 'role_menu_mapping_created_by',
  }),
  updater: one(usersT, {
    fields: [roleMenuMapping.updatedBy],
    references: [usersT.id],
    relationName: 'role_menu_mapping_updated_by',
  }),
}));

export type RoleMenuMappingRow = typeof roleMenuMapping.$inferSelect;
export type RoleMenuMappingInsert = typeof roleMenuMapping.$inferInsert;
