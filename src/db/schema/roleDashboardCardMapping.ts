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
import { dashboardCardMaster } from './dashboardCards';

export const roleDashboardCardMapping = pgTable(
  'role_dashboard_card_mapping_t',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => dashboardCardMaster.id, { onDelete: 'cascade' }),
    menuId: integer('menu_id').references(() => menuMaster.id, {
      onDelete: 'set null',
    }),
    isVisible: boolean('is_visible').notNull().default(true),
    cardOrder: integer('card_order').notNull().default(0),
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
    roleCardUq: uniqueIndex('role_dashboard_card_mapping_role_card_uq').on(
      t.roleId,
      t.cardId,
    ),
  }),
);

export const roleDashboardCardMappingRelations = relations(
  roleDashboardCardMapping,
  ({ one }) => ({
    role: one(roleMaster, {
      fields: [roleDashboardCardMapping.roleId],
      references: [roleMaster.id],
    }),
    card: one(dashboardCardMaster, {
      fields: [roleDashboardCardMapping.cardId],
      references: [dashboardCardMaster.id],
    }),
    menu: one(menuMaster, {
      fields: [roleDashboardCardMapping.menuId],
      references: [menuMaster.id],
    }),
    creator: one(usersT, {
      fields: [roleDashboardCardMapping.createdBy],
      references: [usersT.id],
      relationName: 'role_dashboard_card_mapping_created_by',
    }),
    updater: one(usersT, {
      fields: [roleDashboardCardMapping.updatedBy],
      references: [usersT.id],
      relationName: 'role_dashboard_card_mapping_updated_by',
    }),
  }),
);

export type RoleDashboardCardMappingRow =
  typeof roleDashboardCardMapping.$inferSelect;
export type RoleDashboardCardMappingInsert =
  typeof roleDashboardCardMapping.$inferInsert;
