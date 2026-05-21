import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { ruleMaster } from './rules';

// Workflow tables per root CLAUDE.md §4.6.
//
// A workflow defines the state-machine for one entity type (license,
// consignment, invoice, payment_request, ...). States are not modelled as
// their own table — they're identified by stable string keys on the
// transition rows. Adding a state is just adding the first transition that
// references it.
//
// Each transition can be gated by a rule from rule_master_t (§4.2) and can
// carry an action_json blob describing side effects (status update,
// notification, …). The shape of action_json is intentionally undecided
// until the runtime lands so the project can pick the right level of
// expressiveness.

export const workflowMaster = pgTable('workflow_master_t', {
  id: serial('id').primaryKey(),
  workflowKey: varchar('workflow_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // The entity this workflow drives (e.g. 'license', 'invoice', 'payment_request').
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  // Initial state key for newly created instances.
  initialState: varchar('initial_state', { length: 100 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const workflowTransitionMaster = pgTable('workflow_transition_master_t', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id')
    .notNull()
    .references(() => workflowMaster.id, { onDelete: 'cascade' }),
  transitionKey: varchar('transition_key', { length: 100 }).notNull(),
  fromState: varchar('from_state', { length: 100 }).notNull(),
  toState: varchar('to_state', { length: 100 }).notNull(),
  // Optional gate — if set, evaluateRule must return truthy for this transition
  // to be allowed.
  ruleId: integer('rule_id').references(() => ruleMaster.id, { onDelete: 'set null' }),
  // Side effects to run on transition (notifications, status writes, etc.).
  // Format is unspecified at the schema level — runtime picks it.
  actionJson: jsonb('action_json'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const workflowMasterRelations = relations(workflowMaster, ({ many }) => ({
  transitions: many(workflowTransitionMaster),
}));

export const workflowTransitionMasterRelations = relations(
  workflowTransitionMaster,
  ({ one }) => ({
    workflow: one(workflowMaster, {
      fields: [workflowTransitionMaster.workflowId],
      references: [workflowMaster.id],
    }),
    rule: one(ruleMaster, {
      fields: [workflowTransitionMaster.ruleId],
      references: [ruleMaster.id],
    }),
  }),
);

export type WorkflowMasterRow = typeof workflowMaster.$inferSelect;
export type WorkflowMasterInsert = typeof workflowMaster.$inferInsert;
export type WorkflowTransitionMasterRow = typeof workflowTransitionMaster.$inferSelect;
export type WorkflowTransitionMasterInsert = typeof workflowTransitionMaster.$inferInsert;
