import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { quotationCategoryMaster } from './quotationCategoryMaster';

// Item / service master (charges that appear on quotations & Fiche de Calcul).
// Mirrors the source item_master_t. `tax_not_tax` is a single-letter tax-class code
// (A–P subset); `item_type` is the trade direction (I/E/U and their combinations).
// `category_id` references the quotation category master.
export const itemMaster = pgTable(
  'item_master_t',
  {
    id: serial('id').primaryKey(),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    itemCode: varchar('item_code', { length: 50 }),
    categoryId: integer('category_id').references((): AnyPgColumn => quotationCategoryMaster.id),
    taxNotTax: varchar('tax_not_tax', { length: 1 }).notNull().default('A'),
    percentage: numeric('percentage', { precision: 10, scale: 2 }).default('0'),
    itemType: varchar('item_type', { length: 3 }).notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    categoryIdx: index('idx_item_master_t_category').on(t.categoryId),
    typeIdx: index('idx_item_master_t_type').on(t.itemType),
    displayIdx: index('idx_item_master_t_display').on(t.display),
  }),
);

export type ItemMasterRow = typeof itemMaster.$inferSelect;
export type ItemMasterInsert = typeof itemMaster.$inferInsert;
