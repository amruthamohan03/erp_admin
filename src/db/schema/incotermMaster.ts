import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Incoterm catalogue — the international commercial-terms codes
// (FOB, CIF, EXW, DDP, …) that pin who bears cost / risk at each
// step of a consignment. Two columns: short code (3 letters) +
// full descriptive name shown in pickers.

export const incotermMaster = pgTable('incoterm_master_t', {
  id: serial('id').primaryKey(),
  incotermShortName: varchar('incoterm_short_name', { length: 10 }).notNull(),
  incotermFullName: varchar('incoterm_full_name', { length: 250 }).notNull(),
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

export type IncotermMasterRow = typeof incotermMaster.$inferSelect;
export type IncotermMasterInsert = typeof incotermMaster.$inferInsert;
