import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Status master per root CLAUDE.md §4.1.
//
// One table for every status_key used across the ERP. entity_type scopes a
// status to one entity (`license`, `invoice`, `payment_request`, …) so the
// same string ('draft', 'submitted', 'approved') can carry different
// metadata per entity. entity_type NULL means "applicable to any entity";
// most projects don't need this but it's there for cross-cutting states.
//
// Workflow tables (workflow_master_t.initial_state,
// workflow_transition_master_t.from_state / to_state) hold status_key
// strings — they don't FK here so a workflow can be configured before its
// statuses are seeded. The runtime trusts the master and the join is left
// to UI code that needs to render colors / labels.
//
// is_final marks a terminal state — UI dims it, workflow refuses transitions
// out of it. display_order controls the order in status pickers.

export const statusMaster = pgTable(
  'status_master_t',
  {
    id: serial('id').primaryKey(),
    statusKey: varchar('status_key', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }),
    color: varchar('color', { length: 30 }),
    badge: varchar('badge', { length: 50 }),
    isFinal: boolean('is_final').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // status_key is unique per entity_type. NULL entity_type counts as its
    // own bucket so cross-cutting statuses don't collide with entity-scoped
    // ones with the same key.
    statusKeyEntityUq: uniqueIndex('status_master_key_entity_uq').on(
      t.statusKey,
      t.entityType,
    ),
  }),
);

export type StatusMasterRow = typeof statusMaster.$inferSelect;
export type StatusMasterInsert = typeof statusMaster.$inferInsert;
