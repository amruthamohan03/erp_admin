import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

// Why a tracking file was cancelled (§4.1).
//
// Cancelling an Import, Export or Local file is setting its `clearing_status` to
// CANCELLED (row 7 of clearing_status_master_t). That records the fact; this
// records the reason, which is what somebody deciding months later what to bill
// for a dead consignment actually needs.
//
// A master rather than an enum because which reasons a DRC clearing operation
// recognises is exactly what a business analyst changes without a deploy — §10
// is explicit that a new status or reason list is a master table, not code.
//
// The reason is only meaningful once a file is cancelled, so the field is hidden
// behind a `visibleWhen` condition on each transaction page (§4.12) rather than
// sitting empty on every live consignment's form.

export const cancellationReasonMaster = pgTable(
  'cancellation_reason_master_t',
  {
    id: serial('id').primaryKey(),
    reasonName: varchar('reason_name', { length: 200 }).notNull(),
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
    // Case- and whitespace-insensitive, partial on display — the same shape as
    // every other master name here, so a retired reason frees its wording.
    nameUq: uniqueIndex('cancellation_reason_master_t_name_uq')
      .on(sql`upper(btrim(${t.reasonName}))`)
      .where(sql`${t.display} = 'Y'`),
  }),
);

export type CancellationReasonMasterRow = typeof cancellationReasonMaster.$inferSelect;
export type CancellationReasonMasterInsert = typeof cancellationReasonMaster.$inferInsert;
