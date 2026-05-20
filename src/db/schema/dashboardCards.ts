import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { menuMaster } from './menus';
import { usersT } from './users';

export const dashboardCardMaster = pgTable('dashboard_card_master_t', {
  id: serial('id').primaryKey(),
  cardKey: varchar('card_key', { length: 50 }).notNull().unique(),
  cardContentId: varchar('card_content_id', { length: 50 }).notNull(),
  cardTitle: varchar('card_title', { length: 100 }).notNull(),
  cardSubtitle: varchar('card_subtitle', { length: 100 }),
  cardIcon: varchar('card_icon', { length: 50 }).default('bi-card-text'),
  cardColor: varchar('card_color', { length: 30 }).default('primary'),
  cardUrl: varchar('card_url', { length: 255 }),
  cardOrder: integer('card_order').notNull().default(0),
  cardCategory: varchar('card_category', { length: 50 }).default('general'),
  menuId: integer('menu_id').references(() => menuMaster.id, {
    onDelete: 'set null',
  }),
  dataSource: varchar('data_source', { length: 255 }),
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

export const dashboardCardMasterRelations = relations(
  dashboardCardMaster,
  ({ one }) => ({
    menu: one(menuMaster, {
      fields: [dashboardCardMaster.menuId],
      references: [menuMaster.id],
    }),
    creator: one(usersT, {
      fields: [dashboardCardMaster.createdBy],
      references: [usersT.id],
      relationName: 'dashboard_card_created_by',
    }),
    updater: one(usersT, {
      fields: [dashboardCardMaster.updatedBy],
      references: [usersT.id],
      relationName: 'dashboard_card_updated_by',
    }),
  }),
);

export type DashboardCardRow = typeof dashboardCardMaster.$inferSelect;
export type DashboardCardInsert = typeof dashboardCardMaster.$inferInsert;
