import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Quotation line categories. Quotation lines are grouped by category on
// the quotation page; each category renders as a sub-section.
//
// `category_header` is the section heading shown above the category's
// lines (often bilingual: "Customs Clearance / Dédouanement").
// `display_order` orders the sections.
// `is_customs` is the load-bearing config flag: in Import-Definitive mode
// the customs category switches its money columns from USD to CDF (rate +
// 16% VAT). NEVER name-matched in code — `is_customs=true` is the only
// signal, so renaming the category doesn't break the math.

export const quotationCategoryMaster = pgTable('quotation_category_master_t', {
  id: serial('id').primaryKey(),
  categoryName: varchar('category_name', { length: 150 }).notNull(),
  categoryHeader: varchar('category_header', { length: 255 }),
  displayOrder: integer('display_order').notNull().default(1),
  isCustoms: boolean('is_customs').notNull().default(false),
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

export type QuotationCategoryMasterRow =
  typeof quotationCategoryMaster.$inferSelect;
export type QuotationCategoryMasterInsert =
  typeof quotationCategoryMaster.$inferInsert;
