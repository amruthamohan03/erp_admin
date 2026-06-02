// §4.12 — which roles can see / edit which accordion.
// Composite key on (accordion_id, role_id). The `permission` column lets the
// same role-accordion pair grant either view-only or edit access, but not both
// simultaneously (one row = one decision).
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { roleMaster } from './roles';
import { masterPageAccordion } from './masterPageAccordion';

export const masterPageAccordionRole = pgTable(
  'master_page_accordion_role_t',
  {
    id: serial('id').primaryKey(),
    accordionId: integer('accordion_id')
      .notNull()
      .references(() => masterPageAccordion.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
    // CHECK constraint in migration enforces 'view' | 'edit'.
    permission: varchar('permission', { length: 10 }).notNull(),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    accordionRoleUq: uniqueIndex('uq_master_page_accordion_role_t').on(t.accordionId, t.roleId),
  }),
);

export type MasterPageAccordionRoleRow = typeof masterPageAccordionRole.$inferSelect;
export type MasterPageAccordionRoleInsert = typeof masterPageAccordionRole.$inferInsert;
