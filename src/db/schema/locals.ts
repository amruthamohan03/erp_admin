// Local Tracking — the DRC-internal (non import/export) consignment tracker
// (§2 step 3, Local Tracking). Ported from main's `locals_t`. Restricted in the
// UI to main offices 1/2/4 (Lubumbashi / Kolwezi / Likasi) and clients whose
// client_type includes 'L'. mca_lt_reference is auto-generated (see the
// `local_lt` derive source) and unique.
//
// NOTE: main names the office FK column `location` (not location_id); kept as-is
// so the ported queries/exports line up. `cgea` is a free-text field (not a date)
// per main's "CHANGED: Text field instead of date".
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
import { mainOfficeMaster } from './mainOfficeMaster';

export const localsT = pgTable(
  'locals_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id').references(() => clientMaster.id),
    location: integer('location').references(() => mainOfficeMaster.id),
    mcaLtReference: varchar('mca_lt_reference', { length: 100 }),
    lotNum: varchar('lot_num', { length: 100 }),
    horse: varchar('horse', { length: 100 }),
    trailer1: varchar('trailer_1', { length: 100 }),
    trailer2: varchar('trailer_2', { length: 100 }),
    transporter: varchar('transporter', { length: 100 }),
    nbrOfBags: integer('nbr_of_bags'),
    weight: numeric('weight', { precision: 12, scale: 2 }),
    arrivalDate: date('arrival_date'),
    loadingDate: date('loading_date'),
    bpDetailsReceivedDate: date('bp_details_received_date'),
    pvDivMinesDate: date('pv_div_mines_date'),
    demandeAttestationDate: date('demande_attestation_date'),
    ceecIn: date('ceec_in'),
    ceecOut: date('ceec_out'),
    cgea: varchar('cgea', { length: 100 }),
    govDocsCompleteDate: date('gov_docs_complete_date'),
    dispDate: date('disp_date'),
    endOfFormalities: date('end_of_formalities'),
    remarks: text('remarks'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Partial unique: allow many rows before a reference is assigned.
    mcaLtRefUq: uniqueIndex('uq_locals_t_mca_lt_reference')
      .on(t.mcaLtReference)
      .where(sql`${t.mcaLtReference} IS NOT NULL AND ${t.mcaLtReference} <> ''`),
    clientIdx: index('idx_locals_t_client').on(t.clientId),
    locationIdx: index('idx_locals_t_location').on(t.location),
    displayIdx: index('idx_locals_t_display').on(t.display),
  }),
);

export const localsRelations = relations(localsT, ({ one }) => ({
  client: one(clientMaster, { fields: [localsT.clientId], references: [clientMaster.id] }),
  officeLocation: one(mainOfficeMaster, { fields: [localsT.location], references: [mainOfficeMaster.id] }),
}));

export type LocalRow = typeof localsT.$inferSelect;
export type LocalInsert = typeof localsT.$inferInsert;
