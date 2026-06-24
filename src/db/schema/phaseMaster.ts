import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Workflow phase catalogue ("Documentation", "Customs Clearance",
// "In Transit", "Delivered"). Picked on tracking entries to bucket
// the current operational stage. Distinct from workflow_master_t —
// phases are operator-visible labels; workflow state is the machine
// state behind the scenes.

export const phaseMaster = pgTable('phase_master_t', {
  id: serial('id').primaryKey(),
  phaseName: varchar('phase_name', { length: 150 }).notNull(),
  phaseCode: varchar('phase_code', { length: 50 }).notNull(),
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

export type PhaseMasterRow = typeof phaseMaster.$inferSelect;
export type PhaseMasterInsert = typeof phaseMaster.$inferInsert;
