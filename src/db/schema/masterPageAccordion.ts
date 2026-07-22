// §4.12 — accordions on a transactional page. The accordion is the unit of
// composition AND the unit of permission AND the unit of audit.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { masterPage } from './masterPage';

export const masterPageAccordion = pgTable(
  'master_page_accordion_t',
  {
    id: serial('id').primaryKey(),
    pageId: integer('page_id')
      .notNull()
      .references(() => masterPage.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 100 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    // Optional Tabler icon class (e.g. 'ti ti-info-circle') for the accordion header.
    icon: varchar('icon', { length: 100 }),
    displayOrder: integer('display_order').notNull().default(1),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    pageSlugUq: uniqueIndex('uq_master_page_accordion_t_page_slug').on(t.pageId, t.slug),
  }),
);

export type MasterPageAccordionRow = typeof masterPageAccordion.$inferSelect;
export type MasterPageAccordionInsert = typeof masterPageAccordion.$inferInsert;
