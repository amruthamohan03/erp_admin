import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { groupCompanyMaster } from './groupCompanyMaster';
import { industryMaster } from './industryMaster';
import { refererMaster } from './refererMaster';
import { officeMaster } from './offices';
import { phaseMaster } from './phaseMaster';
import { filesT } from './files';

// Client master per root CLAUDE.md §2 step 1 (client onboarding).
//
// Every consignment in the ERP — license, tracking run, invoice,
// payment request — is owned by exactly one client. `client_code` is
// the stable human-friendly identifier used on customs paperwork.
// `name` is the operating / trading name; `legal_name` is the formal
// entity name that appears on invoices / tax filings.
//
// The extended field set (contact + regulatory + payment blocks)
// mirrors main's clients_t. All extra fields are nullable so an
// operator can save a barebones record and fill regulatory numbers
// later. File references (id_nat_file, rccm_file, etc.) stay as
// plain varchar for now — the files_t FK swap happens per-field
// when the file-upload component wires into the client form.

export const clientMaster = pgTable(
  'client_master_t',
  {
    id: serial('id').primaryKey(),
    clientCode: varchar('client_code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }),
    // ── Classification ─────────────────────────────────────────────
    // clientType is a short enum-ish tag (Corporate, SME, Individual,
    // Gov, NGO). Kept as a free varchar rather than a FK-master so
    // adding a new type doesn't require a schema round-trip; the
    // form offers a picker of the common values but accepts anything.
    clientType: varchar('client_type', { length: 20 }),
    groupCompanyId: integer('group_company_id').references(
      () => groupCompanyMaster.id,
      { onDelete: 'set null' },
    ),
    industryTypeId: integer('industry_type_id').references(
      () => industryMaster.id,
      { onDelete: 'set null' },
    ),
    referredById: integer('referred_by_id').references(() => refererMaster.id, {
      onDelete: 'set null',
    }),
    officeLocationId: integer('office_location_id').references(
      () => officeMaster.id,
      { onDelete: 'set null' },
    ),
    // ── Phase (onboarding lifecycle) ───────────────────────────────
    phaseId: integer('phase_id').references(() => phaseMaster.id, {
      onDelete: 'set null',
    }),
    phaseStartDate: date('phase_start_date'),
    phaseEndDate: date('phase_end_date'),
    // ── Contact block ──────────────────────────────────────────────
    contactPerson: varchar('contact_person', { length: 100 }),
    email: varchar('email', { length: 100 }),
    emailSecondary: varchar('email_secondary', { length: 100 }),
    phone: varchar('phone', { length: 30 }),
    phoneSecondary: varchar('phone_secondary', { length: 30 }),
    address: text('address'),
    // ── Regulatory identifiers (DRC customs) ───────────────────────
    // Each *File column holds a filename / storage key for now; a
    // future migration can add a *FileId column FK-ing files_t once
    // the client form wires the file-upload primitive.
    idNatNumber: varchar('id_nat_number', { length: 50 }),
    // Legacy varchar `id_nat_file` kept for back-compat with existing
    // rows that stored an S3 key / shared drive path. New uploads go
    // through the FK column below (files_t). A future migration will
    // drop the varchar once every consumer switches to reading
    // *_file_id.
    idNatFile: varchar('id_nat_file', { length: 255 }),
    idNatFileId: integer('id_nat_file_id').references(() => filesT.id, {
      onDelete: 'set null',
    }),
    rccmNumber: varchar('rccm_number', { length: 50 }),
    rccmFile: varchar('rccm_file', { length: 255 }),
    rccmFileId: integer('rccm_file_id').references(() => filesT.id, {
      onDelete: 'set null',
    }),
    importExportNumber: varchar('import_export_number', { length: 50 }),
    importExportValidity: date('import_export_validity'),
    importExportFile: varchar('import_export_file', { length: 255 }),
    importExportFileId: integer('import_export_file_id').references(
      () => filesT.id,
      { onDelete: 'set null' },
    ),
    attestationNumber: varchar('attestation_number', { length: 50 }),
    attestationValidity: date('attestation_validity'),
    attestationFile: varchar('attestation_file', { length: 255 }),
    attestationFileId: integer('attestation_file_id').references(
      () => filesT.id,
      { onDelete: 'set null' },
    ),
    nifNumber: varchar('nif_number', { length: 50 }),
    // ── Existing tax ID stays for backward compat ──────────────────
    taxId: varchar('tax_id', { length: 50 }),
    // ── Payment contact (may differ from primary contact) ──────────
    paymentContactEmail: varchar('payment_contact_email', { length: 100 }),
    paymentContactPhone: varchar('payment_contact_phone', { length: 30 }),
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
    industryIdx: index('idx_client_master_t_industry').on(t.industryTypeId),
    groupIdx: index('idx_client_master_t_group').on(t.groupCompanyId),
    officeIdx: index('idx_client_master_t_office').on(t.officeLocationId),
    phaseIdx: index('idx_client_master_t_phase').on(t.phaseId),
  }),
);

export const clientMasterRelations = relations(clientMaster, ({ one }) => ({
  groupCompany: one(groupCompanyMaster, {
    fields: [clientMaster.groupCompanyId],
    references: [groupCompanyMaster.id],
  }),
  industry: one(industryMaster, {
    fields: [clientMaster.industryTypeId],
    references: [industryMaster.id],
  }),
  referredBy: one(refererMaster, {
    fields: [clientMaster.referredById],
    references: [refererMaster.id],
  }),
  officeLocation: one(officeMaster, {
    fields: [clientMaster.officeLocationId],
    references: [officeMaster.id],
  }),
  phase: one(phaseMaster, {
    fields: [clientMaster.phaseId],
    references: [phaseMaster.id],
  }),
}));

export type ClientMasterRow = typeof clientMaster.$inferSelect;
export type ClientMasterInsert = typeof clientMaster.$inferInsert;
