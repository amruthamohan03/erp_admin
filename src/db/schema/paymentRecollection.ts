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
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { paymentRequest } from './paymentRequest';

// Money already PAID on a file that was then cancelled, and whether it has been
// recovered (§2 step 3 / §4.37).
//
// Cancelling a file does not touch its payment requests: the work was done and
// the payment happened, and rewriting that history would lose it. What a
// cancellation creates instead is this — an open item saying "this much went out
// on a file that no longer exists, recover it" — which the File Cancellation
// list shows against the file until someone records the recovery.
//
// One row per payment request per cancellation. The amount is copied at that
// moment, so a later edit of the request cannot change what was claimed back.

export const RECOLLECTION_STATUSES = ['pending', 'recovered', 'written_off'] as const;
export type RecollectionStatus = (typeof RECOLLECTION_STATUSES)[number];

export const paymentRecollection = pgTable(
  'payment_recollection_t',
  {
    id: serial('id').primaryKey(),
    paymentRequestId: integer('payment_request_id')
      .notNull()
      .references(() => paymentRequest.id, { onDelete: 'cascade' }),
    /** The cancelled file this was paid against — 'import' | 'export' | 'local'. */
    fileKind: varchar('file_kind', { length: 10 }).notNull(),
    fileId: integer('file_id').notNull(),
    fileRef: varchar('file_ref', { length: 100 }),
    /** What the request had been paid, as at the cancellation. */
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
    currencyId: integer('currency_id'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** What was actually recovered — a part payment is a real outcome. */
    recoveredAmount: numeric('recovered_amount', { precision: 15, scale: 2 }),
    recoveredDate: date('recovered_date'),
    note: text('note'),
    recoveredBy: integer('recovered_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    fileIdx: index('idx_payment_recollection_file').on(t.fileKind, t.fileId),
    requestIdx: index('idx_payment_recollection_request').on(t.paymentRequestId),
  }),
);

export type PaymentRecollectionRow = typeof paymentRecollection.$inferSelect;
