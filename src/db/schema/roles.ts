import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roleMaster = pgTable('role_master_t', {
  id: serial('id').primaryKey(),
  roleName: varchar('role_name', { length: 100 }).notNull(),
  parentRoleId: integer('parent_role_id').references((): AnyPgColumn => roleMaster.id),
  approvalLevel: integer('approval_level'),
  department: integer('department').notNull().default(0),
  management: integer('management').notNull().default(0),
  finance: integer('finance').notNull().default(0),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const roleMasterRelations = relations(roleMaster, ({ one }) => ({
  parent: one(roleMaster, {
    fields: [roleMaster.parentRoleId],
    references: [roleMaster.id],
    relationName: 'role_parent',
  }),
}));

export type RoleMasterRow = typeof roleMaster.$inferSelect;
export type RoleMasterInsert = typeof roleMaster.$inferInsert;
