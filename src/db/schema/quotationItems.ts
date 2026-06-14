// Quotation line items (quotation_items_t). One row per item in a quotation,
// grouped by quotation category. Carries both the USD columns (qty/taux or
// cost) and the CDF columns used by the Import-Definitive customs section.
import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { quotations } from './quotations';
import { quotationCategoryMaster } from './quotationCategoryMaster';
import { itemMaster } from './itemMaster';
import { unitMaster } from './unitMaster';
import { currencyMaster } from './currencyMaster';

export const quotationItems = pgTable(
  'quotation_items_t',
  {
    id: serial('id').primaryKey(),
    quotationId: integer('quotation_id').notNull().references((): AnyPgColumn => quotations.id),
    categoryId: integer('category_id').references(() => quotationCategoryMaster.id),
    itemId: integer('item_id').references(() => itemMaster.id),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).default('1'),
    unitId: integer('unit_id').references(() => unitMaster.id),
    unitText: varchar('unit_text', { length: 100 }),
    tauxUsd: numeric('taux_usd', { precision: 10, scale: 2 }),
    costUsd: numeric('cost_usd', { precision: 10, scale: 2 }),
    subtotalUsd: numeric('subtotal_usd', { precision: 10, scale: 2 }),
    currencyId: integer('currency_id').references(() => currencyMaster.id),
    hasTva: boolean('has_tva').notNull().default(false),
    tvaUsd: numeric('tva_usd', { precision: 15, scale: 2 }).default('0'),
    totalUsd: numeric('total_usd', { precision: 15, scale: 2 }).default('0'),
    cifSplit: numeric('cif_split', { precision: 15, scale: 2 }).default('0'),
    percentage: numeric('percentage', { precision: 10, scale: 4 }).default('0'),
    rateCdf: numeric('rate_cdf', { precision: 15, scale: 2 }).default('0'),
    vatCdf: numeric('vat_cdf', { precision: 15, scale: 2 }).default('0'),
    totalCdf: numeric('total_cdf', { precision: 15, scale: 2 }).default('0'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    quotationIdx: index('idx_quotation_items_t_quotation').on(t.quotationId),
    categoryIdx: index('idx_quotation_items_t_category').on(t.categoryId),
    itemIdx: index('idx_quotation_items_t_item').on(t.itemId),
    displayIdx: index('idx_quotation_items_t_display').on(t.display),
  }),
);

export type QuotationItemRow = typeof quotationItems.$inferSelect;
export type QuotationItemInsert = typeof quotationItems.$inferInsert;
