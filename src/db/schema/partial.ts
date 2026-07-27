// §5 PARTIELLE allocation — a licence's total weight/FOB is divided into named
// allotments (inspection-report allotments). Each import file consumes from
// exactly one allotment, linked by the legacy string key
// imports_t.inspection_reports = partial_t.partial_name (main's model). The
// snapshot columns record the licence budget at the moment the allotment was cut,
// so later licence edits don't silently rewrite historical allocations.
//
// NOTE: distinct from partial_master_t (a bare name lookup) — this is the
// budgeted allotment table the doc calls partial_t.
import { pgTable, serial, integer, varchar, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { licenseT } from './license';
import { clientMaster } from './clients';

export const partialT = pgTable(
  'partial_t',
  {
    id: serial('id').primaryKey(),
    partialName: varchar('partial_name', { length: 100 }).notNull(),
    licenseId: integer('license_id').references(() => licenseT.id),
    clientId: integer('client_id').references(() => clientMaster.id),
    partialWeight: numeric('partial_weight', { precision: 15, scale: 3 }).notNull().default('0'),
    partialFob: numeric('partial_fob', { precision: 15, scale: 2 }).notNull().default('0'),
    // Licence budget snapshot at allotment-creation time.
    licenseWeight: numeric('license_weight', { precision: 15, scale: 3 }),
    licenseFob: numeric('license_fob', { precision: 15, scale: 2 }),
    licenseInsurance: numeric('license_insurance', { precision: 15, scale: 2 }),
    licenseFreight: numeric('license_freight', { precision: 15, scale: 2 }),
    licenseOtherCosts: numeric('license_other_costs', { precision: 15, scale: 2 }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    nameUq: uniqueIndex('uq_partial_t_name').on(t.partialName),
    licenseIdx: index('idx_partial_t_license').on(t.licenseId),
  }),
);

export const partialRelations = relations(partialT, ({ one }) => ({
  license: one(licenseT, { fields: [partialT.licenseId], references: [licenseT.id] }),
  client: one(clientMaster, { fields: [partialT.clientId], references: [clientMaster.id] }),
}));

export type PartialRow = typeof partialT.$inferSelect;
export type PartialInsert = typeof partialT.$inferInsert;
