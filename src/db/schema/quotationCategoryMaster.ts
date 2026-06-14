import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Quotation line categories (item_master_t.category_id references this). Drives the
// per-category sections on the quotation page. `category_header` is the section
// title shown there (bilingual), `display_order` orders the sections, and
// `is_customs` flags the customs-clearance category that switches to CDF columns in
// Import-Definitive mode (config flag — never name-matched in code). Edited via
// /masters/quotation-categories.
export const quotationCategoryMaster = pgTable('quotation_category_master_t', {
  id: serial('id').primaryKey(),
  categoryName: varchar('category_name', { length: 150 }).notNull(),
  categoryHeader: varchar('category_header', { length: 255 }),
  displayOrder: integer('display_order').notNull().default(1),
  isCustoms: boolean('is_customs').notNull().default(false),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type QuotationCategoryRow = typeof quotationCategoryMaster.$inferSelect;
export type QuotationCategoryInsert = typeof quotationCategoryMaster.$inferInsert;
