// Bivac / PARTIELLE allocation — a per-license split of an import licence's
// capacity (weight / FOB / insurance / freight / other costs) into named
// PARTIELLE. Adapted from main's rich `partial_t`, but this table stores ONLY
// the editable allocation amounts. Everything the PHP persisted as snapshot or
// calculated columns (license_weight, licenseweight_partial_weight, used_*, …)
// is DERIVED at read time — the licence values via a join to license_t and the
// "used" values by summing imports_t where inspection_reports = partial_name
// (§4.10, no redundant stored copies).
import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { licenseT } from './license';
import { clientMaster } from './clients';

export const bivacPartial = pgTable(
  'bivac_partial_t',
  {
    id: serial('id').primaryKey(),
    // The licence this PARTIELLE draws its capacity from.
    licenseId: integer('license_id').references(() => licenseT.id).notNull(),
    // Unique name; imports link to it via imports_t.inspection_reports.
    partialName: varchar('partial_name', { length: 255 }).notNull(),
    clientId: integer('client_id').references(() => clientMaster.id),

    // The five editable allocation amounts (the only user-entered data here).
    partialWeight: numeric('partial_weight', { precision: 15, scale: 2 }).notNull().default('0'),
    partialFob: numeric('partial_fob', { precision: 15, scale: 2 }).notNull().default('0'),
    partialInsurance: numeric('partial_insurance', { precision: 15, scale: 2 }).notNull().default('0'),
    partialFreight: numeric('partial_freight', { precision: 15, scale: 2 }).notNull().default('0'),
    partialOtherCosts: numeric('partial_other_costs', { precision: 15, scale: 2 }).notNull().default('0'),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    partialNameUq: uniqueIndex('uq_bivac_partial_t_partial_name').on(t.partialName),
    licenseIdx: index('idx_bivac_partial_t_license').on(t.licenseId),
    displayIdx: index('idx_bivac_partial_t_display').on(t.display),
  }),
);

export const bivacPartialRelations = relations(bivacPartial, ({ one }) => ({
  license: one(licenseT, {
    fields: [bivacPartial.licenseId],
    references: [licenseT.id],
  }),
  client: one(clientMaster, {
    fields: [bivacPartial.clientId],
    references: [clientMaster.id],
  }),
}));

export type BivacPartialRow = typeof bivacPartial.$inferSelect;
export type BivacPartialInsert = typeof bivacPartial.$inferInsert;
