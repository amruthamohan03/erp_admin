// Import Apurement (licence clearance, IB) — Import License → Import Apurement.
//
// Once an import file is quitted, its licence must be "apured" with the bank:
// the operator records an ASS reference and a clearance type per file, then
// sends the files of one licence to the bank in a numbered TRANSMISSION, and
// later attaches the bank's acknowledgement of receipt (AR).
//
//   apurement_option_master_t — the Type / Remarque choices (§4.1)
//   import_apurement_t        — one row per import file: what was recorded,
//                               and which transmission (if any) carried it
//   import_transmission_t     — one row per transmission sent to a bank
//
// A file's status is DERIVED, never stored: no transmission ⇒ pending, a
// transmission ⇒ apured. The legacy table kept a status column beside the
// transmission id, and the two could disagree.
import { sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { importT } from './imports';
import { licenseT } from './license';
import { clientMaster } from './clients';
import { banklistMaster } from './banklistMaster';
import { filesT } from './files';

/** The two dropdowns on the pending grid. */
export const APUREMENT_OPTION_GROUPS = ['type', 'remark'] as const;
export type ApurementOptionGroup = (typeof APUREMENT_OPTION_GROUPS)[number];

export const apurementOptionMaster = pgTable(
  'apurement_option_master_t',
  {
    id: serial('id').primaryKey(),
    /** `type` (Partial / Total) or `remark` (AV Provisional / License Provisional). */
    optionGroup: varchar('option_group', { length: 20 }).notNull(),
    optionName: varchar('option_name', { length: 100 }).notNull(),
    /**
     * Type rows only. On: a file of this type must also carry a Remarque (the
     * legacy "Partial"). Off: the Remarque is cleared (the legacy "Total"). The
     * rule keys off this flag, never off the option's name.
     */
    requiresRemark: boolean('requires_remark').notNull().default(false),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    groupCheck: check('apurement_option_master_t_group_check', sql`${t.optionGroup} IN ('type', 'remark')`),
    // One name per dropdown, whatever its case.
    nameUnique: uniqueIndex('uq_apurement_option_master_t_name').on(t.optionGroup, sql`upper(${t.optionName})`),
  }),
);

export const importTransmission = pgTable(
  'import_transmission_t',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id').references(() => clientMaster.id).notNull(),
    licenseId: integer('license_id').references(() => licenseT.id).notNull(),
    bankId: integer('bank_id').references(() => banklistMaster.id).notNull(),
    /** Issued by the reference generator (target `import-apurement`, §4.33), numbered per client. */
    transmissionReference: varchar('transmission_reference', { length: 100 }).notNull(),
    transmissionDate: date('transmission_date').notNull(),
    dateDepot: date('date_depot').notNull(),
    /** The bank's acknowledgement of receipt, once it is back. */
    arFileId: integer('ar_file_id').references(() => filesT.id, { onDelete: 'set null' }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Per client, and soft-deleted rows included: a deleted transmission's
    // number is spent, as the generator counts it (§4.33).
    refUnique: uniqueIndex('uq_import_transmission_t_client_ref').on(t.clientId, t.transmissionReference),
    licenseIdx: index('idx_import_transmission_t_license').on(t.licenseId),
  }),
);

export const importApurement = pgTable(
  'import_apurement_t',
  {
    id: serial('id').primaryKey(),
    importId: integer('import_id').references(() => importT.id).notNull(),
    assRef: varchar('ass_ref', { length: 100 }),
    clearanceTypeId: integer('clearance_type_id').references(() => apurementOptionMaster.id),
    clearanceRemarkId: integer('clearance_remark_id').references(() => apurementOptionMaster.id),
    transmissionId: integer('transmission_id').references(() => importTransmission.id),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // One apurement record per file. The legacy table keyed (import_id, display),
    // which let a file hold two live records.
    importUnique: uniqueIndex('uq_import_apurement_t_import').on(t.importId),
    transmissionIdx: index('idx_import_apurement_t_transmission').on(t.transmissionId),
  }),
);

export const importTransmissionRelations = relations(importTransmission, ({ one, many }) => ({
  client: one(clientMaster, { fields: [importTransmission.clientId], references: [clientMaster.id] }),
  license: one(licenseT, { fields: [importTransmission.licenseId], references: [licenseT.id] }),
  bank: one(banklistMaster, { fields: [importTransmission.bankId], references: [banklistMaster.id] }),
  arFile: one(filesT, { fields: [importTransmission.arFileId], references: [filesT.id] }),
  files: many(importApurement),
}));

export const importApurementRelations = relations(importApurement, ({ one }) => ({
  import: one(importT, { fields: [importApurement.importId], references: [importT.id] }),
  transmission: one(importTransmission, {
    fields: [importApurement.transmissionId],
    references: [importTransmission.id],
  }),
}));

export type ApurementOptionRow = typeof apurementOptionMaster.$inferSelect;
export type ImportTransmissionRow = typeof importTransmission.$inferSelect;
export type ImportApurementRow = typeof importApurement.$inferSelect;
