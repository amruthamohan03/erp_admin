import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { sealBatch } from './sealBatches';
import { usersT } from './users';

// Individual physical seal. One row per seal number issued under a batch,
// tracked through its lifecycle:
//   Available — issued by the batch but not yet assigned to a shipment
//   Used      — assigned/applied to a container
//   Damaged   — broken or otherwise unusable
//
// `seal_number` is globally unique (NOT just within a batch) — customs
// authorities track them as unique identifiers across the entire issuing
// operator. status is gated by a CHECK constraint to the three values
// above; a free-form `notes` column lets operators log why a particular
// seal was marked damaged.

export const sealNumber = pgTable(
  'seal_number_t',
  {
    id: serial('id').primaryKey(),
    sealBatchId: integer('seal_batch_id')
      .notNull()
      .references(() => sealBatch.id, { onDelete: 'cascade' }),
    sealNumber: varchar('seal_number', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('Available'),
    notes: text('notes'),
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
    sealNumberUq: uniqueIndex('uq_seal_number_t_seal_number').on(t.sealNumber),
    batchIdx: index('idx_seal_number_t_batch').on(t.sealBatchId),
    statusIdx: index('idx_seal_number_t_status').on(t.status),
    statusCheck: check(
      'seal_number_t_status_check',
      sql`${t.status} IN ('Available', 'Used', 'Damaged')`,
    ),
  }),
);

export const sealNumberRelations = relations(sealNumber, ({ one }) => ({
  batch: one(sealBatch, {
    fields: [sealNumber.sealBatchId],
    references: [sealBatch.id],
  }),
}));

export type SealNumberRow = typeof sealNumber.$inferSelect;
export type SealNumberInsert = typeof sealNumber.$inferInsert;
