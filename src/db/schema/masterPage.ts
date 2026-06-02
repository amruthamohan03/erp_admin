// §4.12 — registers each transactional page (anything that is NOT a master CRUD list).
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const masterPage = pgTable(
  'master_page_t',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    route: varchar('route', { length: 200 }).notNull(),
    // Target table this page writes to (e.g. 'clients_t'). Read-only metadata
    // — the runtime maps this through a server-side whitelist, never trusts it
    // as a SQL identifier directly.
    targetTable: varchar('target_table', { length: 100 }).notNull(),
    displayOrder: integer('display_order').notNull().default(1),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    slugUq: uniqueIndex('uq_master_page_t_slug').on(t.slug),
  }),
);

export type MasterPageRow = typeof masterPage.$inferSelect;
export type MasterPageInsert = typeof masterPage.$inferInsert;
