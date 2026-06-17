import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Approval hierarchy master per CLAUDE.md §4.1 + §2 step 6 (Payment
// Request multi-stage approval).
//
// One row defines a named chain of approval stages. workflow_transition
// rules can require approvals up to a given level by referencing the
// hierarchy and the current level on the entity. The actual gate logic
// lives in a separate rule_master_t rule that consults
// canApproveAtLevel — keeping policy (rule_master) and structure
// (this table) separable.
//
// stages_json shape (validated by parseStages in
// src/lib/approvalHierarchy.ts):
//
//   [
//     { "role_id": 5,  "level": 1, "label": "Department Head" },
//     { "role_id": 12, "level": 2, "label": "Finance Manager" },
//     { "role_id": 30, "level": 3, "label": "CEO" }
//   ]
//
// Levels are 1-based and strictly ascending. Multiple stages may share
// a level (any-of approval at that level) — the parser doesn't enforce
// that one role per level, the caller decides.
//
// entity_type pins the hierarchy to one workflow family (e.g.
// 'payment_request'). Cross-entity hierarchies aren't supported in v1.

export const approvalHierarchyMaster = pgTable('approval_hierarchy_master_t', {
  id: serial('id').primaryKey(),
  hierarchyKey: varchar('hierarchy_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  stagesJson: jsonb('stages_json').notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type ApprovalHierarchyMasterRow = typeof approvalHierarchyMaster.$inferSelect;
export type ApprovalHierarchyMasterInsert = typeof approvalHierarchyMaster.$inferInsert;
