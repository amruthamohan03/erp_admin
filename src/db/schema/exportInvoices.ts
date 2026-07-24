// Export Invoice (§2 step 5, Invoicing — Export). Ported from main's
// export_invoices_t + export_invoice_mca_details_t + export_invoice_items_t.
// Header is a transaction-page; MCA details + items are managed by the custom
// invoice grid (main's calculation UI). validated: 0 not-validated, 1 validated,
// 2 DGI-verified.
import { pgTable, serial, integer, varchar, date, numeric, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
import { licenseT } from './license';

export const exportInvoices = pgTable(
  'export_invoices_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id').references(() => clientMaster.id),
    licenseId: integer('license_id').references(() => licenseT.id),
    kindId: integer('kind_id'),
    goodsTypeId: integer('goods_type_id'),
    transportModeId: integer('transport_mode_id'),
    invoiceRef: varchar('invoice_ref', { length: 100 }),
    invoiceDate: date('invoice_date'),
    fobUsd: numeric('fob_usd', { precision: 15, scale: 2 }).default('0'),
    totalWeight: numeric('total_weight', { precision: 15, scale: 3 }).default('0'),
    totalDutyCdf: numeric('total_duty_cdf', { precision: 18, scale: 2 }).default('0'),
    quotationId: integer('quotation_id'),
    quotationSubTotal: numeric('quotation_sub_total', { precision: 15, scale: 2 }),
    quotationVatAmount: numeric('quotation_vat_amount', { precision: 15, scale: 2 }),
    quotationTotalAmount: numeric('quotation_total_amount', { precision: 15, scale: 2 }),
    arsp: varchar('arsp', { length: 20 }).default('Disabled'),
    dgiCode: varchar('dgi_code', { length: 100 }),
    dgiAmount: numeric('dgi_amount', { precision: 15, scale: 2 }).default('0'),
    normalizedBy: integer('normalized_by'),
    validated: integer('validated').notNull().default(0),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index('idx_export_invoices_t_client').on(t.clientId),
    validatedIdx: index('idx_export_invoices_t_validated').on(t.validated),
    createdByIdx: index('idx_export_invoices_t_created_by').on(t.createdBy),
  }),
);

export const exportInvoiceMcaDetails = pgTable(
  'export_invoice_mca_details_t',
  {
    id: serial('id').primaryKey(),
    exportInvoiceId: integer('export_invoice_id').notNull(),
    mcaId: integer('mca_id'),
    displayOrder: integer('display_order').default(0),
    lotNumber: varchar('lot_number', { length: 255 }),
    declarationNo: varchar('declaration_no', { length: 255 }),
    declarationDate: date('declaration_date'),
    liquidationNo: varchar('liquidation_no', { length: 255 }),
    liquidationDate: date('liquidation_date'),
    liquidationAmount: numeric('liquidation_amount', { precision: 18, scale: 2 }).default('0'),
    liquidationUsd: numeric('liquidation_usd', { precision: 15, scale: 2 }).default('0'),
    quittanceNo: varchar('quittance_no', { length: 255 }),
    quittanceDate: date('quittance_date'),
    horse: varchar('horse', { length: 100 }),
    trailer1: varchar('trailer_1', { length: 100 }),
    trailer2: varchar('trailer_2', { length: 100 }),
    container: varchar('container', { length: 100 }),
    feetContainerId: integer('feet_container_id'),
    weight: numeric('weight', { precision: 15, scale: 3 }).default('0'),
    bccRate: numeric('bcc_rate', { precision: 15, scale: 4 }).default('0'),
    buyer: varchar('buyer', { length: 200 }),
    ceecAmount: numeric('ceec_amount', { precision: 18, scale: 2 }).default('0'),
    cgeaAmount: numeric('cgea_amount', { precision: 18, scale: 2 }).default('0'),
    occAmount: numeric('occ_amount', { precision: 18, scale: 2 }).default('0'),
    lmcAmount: numeric('lmc_amount', { precision: 18, scale: 2 }).default('0'),
    ogefremAmount: numeric('ogefrem_amount', { precision: 18, scale: 2 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    invIdx: index('idx_eimd_invoice').on(t.exportInvoiceId),
    mcaIdx: index('idx_eimd_mca').on(t.mcaId),
  }),
);

export const exportInvoiceItems = pgTable(
  'export_invoice_items_t',
  {
    id: serial('id').primaryKey(),
    exportInvoiceId: integer('export_invoice_id').notNull(),
    quotationItemId: integer('quotation_item_id'),
    categoryId: integer('category_id'),
    categoryName: varchar('category_name', { length: 255 }),
    categoryHeader: varchar('category_header', { length: 255 }),
    displayOrder: integer('display_order').default(999),
    itemId: integer('item_id'),
    itemName: varchar('item_name', { length: 500 }),
    unitId: integer('unit_id'),
    unitText: varchar('unit_text', { length: 100 }),
    quantity: numeric('quantity', { precision: 15, scale: 3 }).default('1'),
    tauxUsd: numeric('taux_usd', { precision: 15, scale: 4 }).default('0'),
    costUsd: numeric('cost_usd', { precision: 15, scale: 4 }).default('0'),
    currencyId: integer('currency_id'),
    hasTva: integer('has_tva').default(0),
    tvaUsd: numeric('tva_usd', { precision: 15, scale: 2 }).default('0'),
    subtotalUsd: numeric('subtotal_usd', { precision: 15, scale: 2 }).default('0'),
    totalUsd: numeric('total_usd', { precision: 15, scale: 2 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({ invIdx: index('idx_eii_invoice').on(t.exportInvoiceId) }),
);

export const exportInvoicesRelations = relations(exportInvoices, ({ one, many }) => ({
  client: one(clientMaster, { fields: [exportInvoices.clientId], references: [clientMaster.id] }),
  mcaDetails: many(exportInvoiceMcaDetails),
  items: many(exportInvoiceItems),
}));

export type ExportInvoiceRow = typeof exportInvoices.$inferSelect;
export type ExportInvoiceInsert = typeof exportInvoices.$inferInsert;
