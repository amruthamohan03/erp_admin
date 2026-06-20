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
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
import { kindMaster } from './kindMaster';
import { transportModeMaster } from './transportModeMaster';
import { typeOfGoodsMaster } from './typeOfGoodsMaster';

// Quotation header. One row per quotation; line items live in
// quotation_items_t. The math is computed server-side from the line
// inputs (see src/lib/quotations/compute.ts) — client-supplied totals
// are recomputed, never trusted, so a malicious client can't ship a
// quotation that says one thing on screen and another in the DB.
//
// `arsp` is an 'Enabled' / 'Disabled' flag for the optional 1.2 % ARSP
// fee on the VAT-eligible subtotal. The CDF columns are populated only
// when the quotation kind is Import-Definitive and there are lines in
// the customs category — see compute.ts for the rules.

export const quotations = pgTable(
  'quotations_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clientMaster.id, { onDelete: 'restrict' }),
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
    kindId: integer('kind_id').references(() => kindMaster.id, {
      onDelete: 'set null',
    }),
    transportModeId: integer('transport_mode_id').references(
      () => transportModeMaster.id,
      { onDelete: 'set null' },
    ),
    goodsTypeId: integer('goods_type_id').references(() => typeOfGoodsMaster.id, {
      onDelete: 'set null',
    }),
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
    // quotation_ref must be unique among LIVE rows only — a soft-deleted
    // ref can be reused without conflict. Partial index lets the unique
    // constraint coexist with soft-delete cleanup.
    refUq: uniqueIndex('uq_quotations_t_ref')
      .on(t.quotationRef)
      .where(sql`${t.display} = 'Y'`),
    clientIdx: index('idx_quotations_t_client').on(t.clientId),
    kindIdx: index('idx_quotations_t_kind').on(t.kindId),
    displayIdx: index('idx_quotations_t_display').on(t.display),
  }),
);

export const quotationsRelations = relations(quotations, ({ one }) => ({
  client: one(clientMaster, {
    fields: [quotations.clientId],
    references: [clientMaster.id],
  }),
  kind: one(kindMaster, {
    fields: [quotations.kindId],
    references: [kindMaster.id],
  }),
  transportMode: one(transportModeMaster, {
    fields: [quotations.transportModeId],
    references: [transportModeMaster.id],
  }),
  goodsType: one(typeOfGoodsMaster, {
    fields: [quotations.goodsTypeId],
    references: [typeOfGoodsMaster.id],
  }),
}));

export type QuotationRow = typeof quotations.$inferSelect;
export type QuotationInsert = typeof quotations.$inferInsert;
