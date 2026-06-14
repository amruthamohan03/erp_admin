// Quotation header (quotations_t). One row per quotation; line items live in
// quotation_items_t. Mirrors the source schema with real FKs added.
import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { clients } from './clients';
import { kindMaster } from './kindMaster';
import { transportModeMaster } from './transportModeMaster';
import { typeOfGoodsMaster } from './typeOfGoodsMaster';

export const quotations = pgTable(
  'quotations_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id').references((): AnyPgColumn => clients.id),
    quotationRef: varchar('quotation_ref', { length: 255 }).notNull(),
    quotationDate: date('quotation_date'),
    subTotal: numeric('sub_total', { precision: 15, scale: 2 }).default('0'),
    vatAmount: numeric('vat_amount', { precision: 15, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).default('0'),
    subTotalCdf: numeric('sub_total_cdf', { precision: 15, scale: 2 }),
    vatAmountCdf: numeric('vat_amount_cdf', { precision: 15, scale: 2 }),
    totalAmountCdf: numeric('total_amount_cdf', { precision: 15, scale: 2 }),
    arsp: varchar('arsp', { length: 10 }),
    arspAmount: numeric('arsp_amount', { precision: 15, scale: 2 }).default('0'),
    kindId: integer('kind_id').references(() => kindMaster.id),
    transportModeId: integer('transport_mode_id').references(() => transportModeMaster.id),
    goodsTypeId: integer('goods_type_id').references(() => typeOfGoodsMaster.id),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Ref unique among live rows (soft-deleted refs can be reused).
    refUq: uniqueIndex('uq_quotations_t_ref')
      .on(t.quotationRef)
      .where(sql`${t.display} = 'Y'`),
    clientIdx: index('idx_quotations_t_client').on(t.clientId),
    kindIdx: index('idx_quotations_t_kind').on(t.kindId),
    displayIdx: index('idx_quotations_t_display').on(t.display),
  }),
);

export type QuotationRow = typeof quotations.$inferSelect;
export type QuotationInsert = typeof quotations.$inferInsert;
