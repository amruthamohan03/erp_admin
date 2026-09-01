import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  date,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { groupCompanyMaster } from './groupCompanyMaster';
import { industryMaster } from './industryMaster';
import { refererMaster } from './refererMaster';
import { officeLocationMaster } from './officeLocationMaster';
import { mainOfficeMaster } from './mainOfficeMaster';
import { paymentTermMaster } from './paymentTermMaster';
import { phaseMaster } from './phaseMaster';
import { doneByMaster } from './doneByMaster';
import { filesT } from './files';

// Client master per root CLAUDE.md §2 step 1 (client onboarding).
//
// Column set mirrors main's `clients_t` exactly (company_name /
// short_name / client_type + the financial/verification block) so the
// two branches share one shape. The Drizzle export name (`clientMaster`)
// and SQL table name (`client_master_t`) are kept for restructure — the
// /api/v1/pages runtime maps the 'clients' slug onto `clientMaster`.
//
// Restructure additively keeps the four `*_file_id` FK columns
// (id_nat_file_id, rccm_file_id, import_export_file_id,
// attestation_file_id) alongside main's plain-varchar `*_file` paths;
// new uploads go through the files_t FK, legacy rows keep the varchar.

export const clientMaster = pgTable(
  'client_master_t',
  {
    id: serial('id').primaryKey(),
    companyName: varchar('company_name', { length: 200 }).notNull(),
    // Client code — 3 chars. Case-insensitive UNIQUE enforced in migration.
    shortName: varchar('short_name', { length: 3 }).notNull(),
    // Letters I/E/L in any combination ('I', 'E', 'L', 'IE', 'IEL', etc.).
    clientType: varchar('client_type', { length: 10 }).notNull(),

    groupCompanyId: integer('group_company_id').references(
      () => groupCompanyMaster.id,
    ),
    industryTypeId: integer('industry_type_id').references(
      () => industryMaster.id,
    ),
    // Referrer master — note source DB misspells "referrer" as "refferer".
    referredById: integer('referred_by_id').references(() => refererMaster.id),
    // "Location" on the client form reads the MAIN OFFICE master (migration 0056
    // retargeted it). The column name is unchanged so nothing else had to move.
    officeLocationId: integer('office_location_id').references(
      () => mainOfficeMaster.id,
    ),

    address: text('address'),

    phaseId: integer('phase_id').references(() => phaseMaster.id),
    phaseStartDate: date('phase_start_date'),
    phaseEndDate: date('phase_end_date'),

    contactPerson: varchar('contact_person', { length: 100 }),
    email: varchar('email', { length: 100 }),
    emailSecondary: varchar('email_secondary', { length: 100 }),
    phone: varchar('phone', { length: 20 }),
    phoneSecondary: varchar('phone_secondary', { length: 20 }),

    // Statutory identifiers — case-insensitive UNIQUE enforced where not null.
    idNatNumber: varchar('id_nat_number', { length: 50 }),
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

    paymentContactEmail: varchar('payment_contact_email', { length: 100 }),
    paymentContactPhone: varchar('payment_contact_phone', { length: 20 }),
    // Legacy free text, kept because the clients dashboard still groups by it.
    // New saves write paymentTermId; read the master through the join.
    paymentTerm: varchar('payment_term', { length: 50 }),
    paymentTermId: integer('payment_term_id').references(() => paymentTermMaster.id),
    // CHECK constraint in migration: 0 <= credit_term <= 365
    creditTerm: integer('credit_term').default(0),

    // Three "done by" assignments — FK to done_by_master_t: the client, or us.
    // The company row renders as the configured project name, not stored text
    // (see src/lib/doneByLabel.ts), so don't assume a fixed id or label here.
    liquidationPaidBy: integer('liquidation_paid_by').references(
      () => doneByMaster.id,
    ),
    licenseClearedBy: integer('license_cleared_by').references(
      () => doneByMaster.id,
    ),
    licenseSubmitToBank: integer('license_submit_to_bank').references(
      () => doneByMaster.id,
    ),

    contractStartDate: date('contract_start_date'),
    contractValidity: date('contract_validity'),

    approvalCode: varchar('approval_code', { length: 50 }),
    // CHECK constraint in migration: invoice_template IN ('I', 'E', 'L')
    invoiceTemplate: varchar('invoice_template', { length: 1 })
      .notNull()
      .default('I'),

    verifiedById: integer('verified_by_id').references(
      (): AnyPgColumn => usersT.id,
    ),
    verifiedByDate: date('verified_by_date'),
    approvedById: integer('approved_by_id').references(
      (): AnyPgColumn => usersT.id,
    ),
    approvedByDate: date('approved_by_date'),

    remarks: text('remarks'),

    // Test field driven by the §4.12 transactional-page runtime.
    test: integer('test'),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id, {
      onDelete: 'set null',
    }),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id, {
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
    referredByIdx: index('idx_client_master_t_referred_by').on(t.referredById),
    displayCompanyIdx: index('idx_client_master_t_display_company').on(
      t.display,
      t.companyName,
    ),
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
  officeLocation: one(mainOfficeMaster, {
    fields: [clientMaster.officeLocationId],
    references: [mainOfficeMaster.id],
  }),
  paymentTermRef: one(paymentTermMaster, {
    fields: [clientMaster.paymentTermId],
    references: [paymentTermMaster.id],
  }),
  phase: one(phaseMaster, {
    fields: [clientMaster.phaseId],
    references: [phaseMaster.id],
  }),
}));

export type ClientMasterRow = typeof clientMaster.$inferSelect;
export type ClientMasterInsert = typeof clientMaster.$inferInsert;
