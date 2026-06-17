import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clientMaster } from './clients';
import { invoiceT } from './invoice';
import { usersT } from './users';

// Payment request entity per CLAUDE.md §2 step 6 — multi-stage approval
// chain driven by approval_hierarchy_master_t. Transactional table (no
// _master_t suffix).
//
// state holds a status_master_t.status_key value for entity_type =
// 'payment_request'. The workflow advances state per approval level
// (level_1_approved → level_2_approved → fully_approved → paid). The
// case-runtime drives this via the 'payment_request_default' workflow
// (seeded in src/db/seed/paymentRequestWorkflow.ts) whose approve_l*
// transitions carry approval actions that gate on the seeded hierarchy.
//
// invoice_id is optional — payment requests can stand alone (employee
// reimbursements, etc.) or settle a specific invoice.

export const paymentRequestT = pgTable('payment_request_t', {
  id: serial('id').primaryKey(),
  requestNumber: varchar('request_number', { length: 100 }).notNull().unique(),
  clientId: integer('client_id').references(() => clientMaster.id, {
    onDelete: 'set null',
  }),
  invoiceId: integer('invoice_id').references(() => invoiceT.id, {
    onDelete: 'set null',
  }),
  state: varchar('state', { length: 50 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  purpose: varchar('purpose', { length: 255 }),
  // Highest approval level granted so far. Starts at 0; each approve_l*
  // transition's set_field actions bump it. The approval action on the
  // transition checks canApproveAtLevel(stages, actor.roleId, level - 1).
  currentApprovalLevel: integer('current_approval_level').notNull().default(0),
  approvedAt: timestamp('approved_at', { withTimezone: false }),
  paidAt: timestamp('paid_at', { withTimezone: false }),
  dueDate: date('due_date'),
  notes: text('notes'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const paymentRequestRelations = relations(paymentRequestT, ({ one }) => ({
  client: one(clientMaster, {
    fields: [paymentRequestT.clientId],
    references: [clientMaster.id],
  }),
  invoice: one(invoiceT, {
    fields: [paymentRequestT.invoiceId],
    references: [invoiceT.id],
  }),
}));

export type PaymentRequestRow = typeof paymentRequestT.$inferSelect;
export type PaymentRequestInsert = typeof paymentRequestT.$inferInsert;
