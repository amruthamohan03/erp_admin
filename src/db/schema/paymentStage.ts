// §4.1 / §4.6 — the Payment Request approval chain as CONFIGURATION.
//
// One row per stage the request passes through. Everything an administrator
// might want to change about the chain lives here and is edited under
// Masters → Payment Stages: what a stage is called, the order the stages run in,
// whether a stage is used at all, which payment types it applies to, and what it
// asks the approver for. The runtime (src/lib/payments/stages.ts) reads these
// rows and states none of it itself.
//
// `stage` is a closed set because each stage writes its own four columns on
// payment_request_t (flag / at / by / notes — see STAGE_COLUMNS). Adding a sixth
// stage is therefore a schema change, not a row; everything ABOUT the five is a
// row. Who may act on each stage is the sibling table payment_stage_role_master_t.
import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// The five stage SLOTS — each backed by its own columns on payment_request_t.
export const PAYMENT_STAGES = ['dept', 'finance', 'management', 'under_process', 'paid'] as const;
export type PaymentStage = (typeof PAYMENT_STAGES)[number];

/**
 * The badge hues a stage may be given. A closed set rather than a free hex, so
 * every choice already has a vetted light AND dark reading (§4.32) — see
 * src/lib/payments/stageTone.ts.
 */
export const PAYMENT_STAGE_TONES = ['amber', 'cyan', 'violet', 'sky', 'orange', 'blue', 'teal', 'fuchsia', 'slate'] as const;
export type PaymentStageTone = (typeof PAYMENT_STAGE_TONES)[number];

export const paymentStageMaster = pgTable(
  'payment_stage_master_t',
  {
    id: serial('id').primaryKey(),
    stage: varchar('stage', { length: 20 }).notNull(),
    /** The stage's name — "Department", "Finance". */
    label: varchar('label', { length: 60 }).notNull(),
    /** The status a request waiting on this stage shows — "Pending Dept". */
    pendingLabel: varchar('pending_label', { length: 60 }).notNull(),
    /** Run order; lower first. */
    sortOrder: integer('sort_order').notNull(),
    /** NULL — every request; 'Bank' / 'Cash' — only requests of that payment type. */
    paymentType: varchar('payment_type', { length: 10 }),
    /** The approver may record a chargeback here. */
    capturesChargeback: boolean('captures_chargeback').notNull().default(false),
    /** The approver must name who collected the cash. */
    requiresCashCollector: boolean('requires_cash_collector').notNull().default(false),
    /** The approver may attach Documents 3 and 4 (proof of payment). */
    capturesDocuments: boolean('captures_documents').notNull().default(false),
    /** Gets a signature cell under AUTORISATION on the printed Demande de Fonds. */
    printSignature: boolean('print_signature').notNull().default(false),
    tone: varchar('tone', { length: 20 }).notNull().default('slate'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    stageUq: uniqueIndex('uq_payment_stage_master_stage').on(t.stage),
  }),
);

export type PaymentStageMasterRow = typeof paymentStageMaster.$inferSelect;
