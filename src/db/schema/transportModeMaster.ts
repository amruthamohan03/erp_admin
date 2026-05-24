import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const transportModeMaster = pgTable('transport_mode_master_t', {
  id: serial('id').primaryKey(),
  transportModeName: varchar('transport_mode_name', { length: 100 }).notNull(),
  transportLetter: varchar('transport_letter', { length: 5 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type TransportModeMasterRow = typeof transportModeMaster.$inferSelect;
export type TransportModeMasterInsert = typeof transportModeMaster.$inferInsert;
