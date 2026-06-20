import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Transport mode — sea / air / road / rail. The `transport_letter` is a
// single-letter code (S/A/R) used on customs paperwork; the full name is
// shown in the UI.

export const transportModeMaster = pgTable('transport_mode_master_t', {
  id: serial('id').primaryKey(),
  transportModeName: varchar('transport_mode_name', { length: 100 }).notNull(),
  transportLetter: varchar('transport_letter', { length: 5 }).notNull(),
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

export type TransportModeMasterRow = typeof transportModeMaster.$inferSelect;
export type TransportModeMasterInsert = typeof transportModeMaster.$inferInsert;
