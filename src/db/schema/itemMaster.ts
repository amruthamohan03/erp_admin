import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { quotationCategoryMaster } from './quotationCategoryMaster';

// Item / service master — the catalogue of charges that appear on
// quotations and Fiche de Calcul (clearance fees, freight, handling, etc.).
//
// `tax_not_tax` is a single-letter tax-class code (A–P subset). It drives
// downstream tax handling — A is the standard taxable class; other letters
// flag exemptions / withholdings.
// `item_type` is the trade direction: 'I' (Import), 'E' (Export), 'U'
// (Universal), or combinations ('IE', 'IU', 'EU'). Quotation kind filters
// item lookups against this.
// `category_id` ties the item to its quotation_category — the math path
// depends on category.is_customs.

export const itemMaster = pgTable(
  'item_master_t',
  {
    id: serial('id').primaryKey(),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    itemCode: varchar('item_code', { length: 50 }),
    categoryId: integer('category_id').references(
      () => quotationCategoryMaster.id,
      { onDelete: 'set null' },
    ),
    taxNotTax: varchar('tax_not_tax', { length: 1 }).notNull().default('A'),
    percentage: numeric('percentage', { precision: 10, scale: 2 }).default('0'),
    itemType: varchar('item_type', { length: 3 }).notNull(),
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
  },
  (t) => ({
    categoryIdx: index('idx_item_master_t_category').on(t.categoryId),
    typeIdx: index('idx_item_master_t_type').on(t.itemType),
    displayIdx: index('idx_item_master_t_display').on(t.display),
  }),
);

export type ItemMasterRow = typeof itemMaster.$inferSelect;
export type ItemMasterInsert = typeof itemMaster.$inferInsert;
