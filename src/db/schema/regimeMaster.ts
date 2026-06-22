import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Customs regime — the legal classification a consignment moves under
// (e.g. "Import Definitive", "Temporary Admission", "Transit"). The
// `type` is a 2-char code that pairs with the human name on customs
// declarations.

export const regimeMaster = pgTable('regime_master_t', {
  id: serial('id').primaryKey(),
  regimeName: varchar('regime_name', { length: 200 }).notNull(),
  type: varchar('type', { length: 2 }).notNull(),
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

export type RegimeMasterRow = typeof regimeMaster.$inferSelect;
export type RegimeMasterInsert = typeof regimeMaster.$inferInsert;
