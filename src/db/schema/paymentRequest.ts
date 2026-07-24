// Payment Request — the independent, multi-stage approval workflow of the
// consignment lifecycle (§2 step 6 / §4.6). Ported from main's `payment_requests`.
//
// Approval columns follow main's tri-state convention: NULL = pending, 1 =
// approved, -1 = rejected, for each of the five stages (dept, finance,
// management, under_process, paid). WHO may act on a stage lives in
// payment_stage_role_master_t (§4.7 — no hardcoded roles), not in code.
//
// mca_data holds the reference/amount lines as JSONB ([{ mca_ref, amount }]).
// file*_path columns mirror main's document paths; wiring real uploads waits on
// the S3 `files` table (§4.11), not provisioned in this environment.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  smallint,
  numeric,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { departmentMaster } from './departmentMaster';
import { mainOfficeMaster } from './mainOfficeMaster';
import { clientMaster } from './clients';
import { currencyMaster } from './currencyMaster';
import { expenseTypeMaster } from './expenseTypeMaster';

export interface McaLine {
  mca_ref: string;
  amount: number;
}

export const paymentRequest = pgTable(
  'payment_request_t',
  {
    id: serial('id').primaryKey(),
    beneficiary: varchar('beneficiary', { length: 200 }),
    requestee: varchar('requestee', { length: 200 }).notNull(),
    department: integer('department').references(() => departmentMaster.id),
    locationId: integer('location_id').references(() => mainOfficeMaster.id),
    clientId: integer('client_id').references(() => clientMaster.id),
    // 0=Import 1=Export 2=Local 3=Other 4=Pre Payment (matches main's pay_for).
    payFor: smallint('pay_for'),
    currency: integer('currency').references(() => currencyMaster.id),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
    paymentType: varchar('payment_type', { length: 10 }), // 'Bank' | 'Cash'
    expenseType: integer('expense_type').references(() => expenseTypeMaster.id),
    motif: text('motif'),
    cashCollector: varchar('cash_collector', { length: 100 }),
    mcaRef: varchar('mca_ref', { length: 255 }),
    mcaData: jsonb('mca_data').$type<McaLine[]>().default([]),
    chargeback: numeric('chargeback', { precision: 15, scale: 2 }),

    file1Path: varchar('file1_path', { length: 500 }),
    file2Path: varchar('file2_path', { length: 500 }),
    file3Path: varchar('file3_path', { length: 500 }),
    file4Path: varchar('file4_path', { length: 500 }),

    // Stage tri-state approvals (NULL pending / 1 approved / -1 rejected).
    deptApproval: smallint('dept_approval'),
    deptApprovedAt: timestamp('dept_approved_at', { withTimezone: false }),
    deptApprovedBy: integer('dept_approved_by').references(() => usersT.id, { onDelete: 'set null' }),
    deptNotes: text('dept_notes'),

    financeApproval: smallint('finance_approval'),
    financeApprovedAt: timestamp('finance_approved_at', { withTimezone: false }),
    financeApprovedBy: integer('finance_approved_by').references(() => usersT.id, { onDelete: 'set null' }),
    financeNotes: text('finance_notes'),

    managementApproval: smallint('management_approval'),
    managementApprovedAt: timestamp('management_approved_at', { withTimezone: false }),
    managementApprovedBy: integer('management_approved_by').references(() => usersT.id, { onDelete: 'set null' }),
    managementNotes: text('management_notes'),

    underProcess: smallint('under_process'),
    underProcessAt: timestamp('under_process_at', { withTimezone: false }),
    underProcessBy: integer('under_process_by').references(() => usersT.id, { onDelete: 'set null' }),
    underProcessNotes: text('under_process_notes'),

    paidApproval: smallint('paid_approval'),
    paidApprovedAt: timestamp('paid_approved_at', { withTimezone: false }),
    paidApprovedBy: integer('paid_approved_by').references(() => usersT.id, { onDelete: 'set null' }),
    paidNotes: text('paid_notes'),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    createdByIdx: index('idx_payment_request_t_created_by').on(t.createdBy),
    locationIdx: index('idx_payment_request_t_location').on(t.locationId),
    typeIdx: index('idx_payment_request_t_type').on(t.paymentType),
  }),
);

export const paymentRequestRelations = relations(paymentRequest, ({ one }) => ({
  departmentRel: one(departmentMaster, { fields: [paymentRequest.department], references: [departmentMaster.id] }),
  location: one(mainOfficeMaster, { fields: [paymentRequest.locationId], references: [mainOfficeMaster.id] }),
  client: one(clientMaster, { fields: [paymentRequest.clientId], references: [clientMaster.id] }),
  currencyRel: one(currencyMaster, { fields: [paymentRequest.currency], references: [currencyMaster.id] }),
  expenseTypeRel: one(expenseTypeMaster, { fields: [paymentRequest.expenseType], references: [expenseTypeMaster.id] }),
}));

export type PaymentRequestRow = typeof paymentRequest.$inferSelect;
export type PaymentRequestInsert = typeof paymentRequest.$inferInsert;
