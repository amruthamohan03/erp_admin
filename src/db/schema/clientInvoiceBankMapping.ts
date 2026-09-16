import {
  pgTable,
  serial,
  integer,
  boolean,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { clientMaster } from './clients';
import { invoiceBankMaster } from './invoiceBankMaster';
import { usersT } from './users';

// §4.1 — which of OUR bank accounts a client is invoiced through.
//
// `invoice_bank_master_t` holds the accounts whose name, number, SWIFT and
// address get printed on an invoice. Until migration 0090 nothing in the schema
// referenced that table at all, so an invoice had no way to know which account
// belonged on it and the "Client to Bank" menu pointed at '#'.
//
// Many-to-many with one marked default, rather than a single column on
// client_master_t: a client can legitimately be invoiced through more than one
// account (different currencies, different group entities), and the shape that
// allows several also covers the client who only ever uses one.

export const clientInvoiceBankMapping = pgTable(
  'client_invoice_bank_mapping_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clientMaster.id, { onDelete: 'cascade' }),
    // RESTRICT, not cascade: an account a client still invoices through must not
    // disappear from under them (§4.37). Deleting the CLIENT takes its mappings
    // with it, which is why the two sides differ.
    invoiceBankId: integer('invoice_bank_id')
      .notNull()
      .references(() => invoiceBankMaster.id, { onDelete: 'restrict' }),
    isDefault: boolean('is_default').notNull().default(false),
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
    // One live row per pairing; partial so un-assigning frees it again (§4.27).
    pair: uniqueIndex('uq_client_invoice_bank_mapping_t_pair')
      .on(t.clientId, t.invoiceBankId)
      .where(sql`${t.display} = 'Y'`),
    // At most one default per client, enforced by the DATABASE. "Which account
    // does this client invoice through" must have one answer, and neither a UI
    // bug nor an API-only caller may create a second.
    oneDefault: uniqueIndex('uq_client_invoice_bank_mapping_t_default')
      .on(t.clientId)
      .where(sql`${t.isDefault} AND ${t.display} = 'Y'`),
    clientIdx: index('client_invoice_bank_mapping_t_client_idx').on(t.clientId),
  }),
);

export const clientInvoiceBankMappingRelations = relations(
  clientInvoiceBankMapping,
  ({ one }) => ({
    client: one(clientMaster, {
      fields: [clientInvoiceBankMapping.clientId],
      references: [clientMaster.id],
    }),
    invoiceBank: one(invoiceBankMaster, {
      fields: [clientInvoiceBankMapping.invoiceBankId],
      references: [invoiceBankMaster.id],
    }),
  }),
);

export type ClientInvoiceBankMappingRow = typeof clientInvoiceBankMapping.$inferSelect;
export type ClientInvoiceBankMappingInsert = typeof clientInvoiceBankMapping.$inferInsert;
