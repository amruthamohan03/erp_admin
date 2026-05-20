import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { roleMenuMapping } from './roleMenuMapping';

export const menuMaster = pgTable('menu_master_t', {
  id: serial('id').primaryKey(),
  menuId: integer('menu_id').references((): AnyPgColumn => menuMaster.id),
  menuOrder: integer('menu_order').notNull().default(1),
  menuLevel: integer('menu_level').default(0),
  menuName: varchar('menu_name', { length: 255 }).notNull(),
  url: varchar('url', { length: 255 }).default('#'),
  text: varchar('text', { length: 100 }),
  icon: varchar('icon', { length: 100 }),
  badge: varchar('badge', { length: 50 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const menuMasterRelations = relations(menuMaster, ({ one, many }) => ({
  parent: one(menuMaster, {
    fields: [menuMaster.menuId],
    references: [menuMaster.id],
    relationName: 'menu_parent',
  }),
  // Reverse of roleMenuMapping.menu — lets relational queries pull the
  // mapping rows for a given role alongside the menu row.
  roleMappings: many(roleMenuMapping),
}));

export type MenuRow = typeof menuMaster.$inferSelect;
export type MenuInsert = typeof menuMaster.$inferInsert;
