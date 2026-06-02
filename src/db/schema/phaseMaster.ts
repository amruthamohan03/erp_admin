// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `phase_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const phaseMaster = pgTable('phase_master_t', {
  id: serial('id').primaryKey(),
  phaseName: varchar('phase_name', { length: 150 }).notNull(),
  phaseCode: varchar('phase_code', { length: 50 }).notNull(),
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

export type PhaseMasterRow = typeof phaseMaster.$inferSelect;
export type PhaseMasterInsert = typeof phaseMaster.$inferInsert;
