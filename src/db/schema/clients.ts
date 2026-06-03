// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `clients_t` because
// the user asked to mirror the source DB naming exactly.
//
// TODO(storage): the four *_file columns below (id_nat_file, rccm_file,
// import_export_file, attestation_file) are plain varchar paths in the source dump.
// Per CLAUDE.md §4.11 binary files must live in S3 with an FK to a `files` table.
// When that table exists, replace each of these with `*_file_id` integer FKs and
// migrate the existing values out of varchar.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  timestamp,
  type AnyPgColumn,
  index,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { groupCompanyMaster } from './groupCompanyMaster';
import { industryMaster } from './industryMaster';
import { officeLocationMaster } from './officeLocationMaster';
import { phaseMaster } from './phaseMaster';
import { refererMaster } from './refererMaster';
import { doneBy } from './doneBy';

export const clients = pgTable(
  'clients_t',
  {
    id: serial('id').primaryKey(),
    companyName: varchar('company_name', { length: 200 }).notNull(),
    // Client code — 3 chars. Case-insensitive UNIQUE enforced in migration.
    shortName: varchar('short_name', { length: 3 }).notNull(),
    // Letters I/E/L in any combination ('I', 'E', 'L', 'IE', 'IEL', etc.) —
    // enforced via CHECK constraint in migration.
    clientType: varchar('client_type', { length: 10 }).notNull(),

    groupCompanyId: integer('group_company_id').references(() => groupCompanyMaster.id),
    industryTypeId: integer('industry_type_id').references(() => industryMaster.id),
    // Referrer master — note source DB misspells "referrer" as "refferer".
    referredById: integer('referred_by_id').references(() => refererMaster.id),
    officeLocationId: integer('office_location_id').references(() => officeLocationMaster.id),

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
    rccmNumber: varchar('rccm_number', { length: 50 }),
    rccmFile: varchar('rccm_file', { length: 255 }),
    importExportNumber: varchar('import_export_number', { length: 50 }),
    importExportValidity: date('import_export_validity'),
    importExportFile: varchar('import_export_file', { length: 255 }),
    attestationNumber: varchar('attestation_number', { length: 50 }),
    attestationValidity: date('attestation_validity'),
    attestationFile: varchar('attestation_file', { length: 255 }),
    nifNumber: varchar('nif_number', { length: 50 }),

    paymentContactEmail: varchar('payment_contact_email', { length: 100 }),
    paymentContactPhone: varchar('payment_contact_phone', { length: 20 }),
    // CHECK constraint in migration restricts to: ADVANCE | 15days | 30days | 45days | 60days
    paymentTerm: varchar('payment_term', { length: 50 }),
    // CHECK constraint in migration: 0 <= credit_term <= 365
    creditTerm: integer('credit_term').default(0),

    // Three "done by" assignments — FK to done_by_t (1=Client, 2=Malabar).
    liquidationPaidBy: integer('liquidation_paid_by').references(() => doneBy.id),
    licenseClearedBy: integer('license_cleared_by').references(() => doneBy.id),
    licenseSubmitToBank: integer('license_submit_to_bank').references(() => doneBy.id),

    contractStartDate: date('contract_start_date'),
    contractValidity: date('contract_validity'),

    approvalCode: varchar('approval_code', { length: 50 }),
    // CHECK constraint in migration: invoice_template IN ('I', 'E', 'L')
    invoiceTemplate: varchar('invoice_template', { length: 1 }).notNull().default('I'),

    verifiedById: integer('verified_by_id').references((): AnyPgColumn => usersT.id),
    verifiedByDate: date('verified_by_date'),
    approvedById: integer('approved_by_id').references((): AnyPgColumn => usersT.id),
    approvedByDate: date('approved_by_date'),

    remarks: text('remarks'),

    // Test field driven by the §4.12 transactional-page runtime. Bound to the
    // 'test' select field on the Clients "Verification & Approval" accordion,
    // whose options come from /api/industries — so it stores an industry id.
    test: integer('test'),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // FK index — speeds up the join used by every client list page.
    groupCompanyIdx: index('idx_clients_t_group_company').on(t.groupCompanyId),
    industryTypeIdx: index('idx_clients_t_industry_type').on(t.industryTypeId),
    officeLocationIdx: index('idx_clients_t_office_location').on(t.officeLocationId),
    phaseIdx: index('idx_clients_t_phase').on(t.phaseId),
    referredByIdx: index('idx_clients_t_referred_by').on(t.referredById),
    displayCompanyIdx: index('idx_clients_t_display_company').on(t.display, t.companyName),
  }),
);

export type ClientRow = typeof clients.$inferSelect;
export type ClientInsert = typeof clients.$inferInsert;
