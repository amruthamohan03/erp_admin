import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Partial-shipment classification. References hang off imports_t /
// exports_t when a consignment is split across multiple movements
// (partial-1, partial-2, …). Adapted from main's `partial_t` — renamed
// to `partial_master_t` per the §4.1 `_master_t` convention since this
// is a lookup not a transactional table.

export const partialMaster = pgTable('partial_master_t', {
  id: serial('id').primaryKey(),
  partialName: varchar('partial_name', { length: 150 }).notNull(),
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
});

export type PartialMasterRow = typeof partialMaster.$inferSelect;
export type PartialMasterInsert = typeof partialMaster.$inferInsert;
