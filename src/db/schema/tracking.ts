import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { licenseT } from './license';
import { trackingTemplateMaster } from './trackingTemplates';
import { usersT } from './users';

// Tracking entity per root CLAUDE.md §2 step 3 — one row per consignment
// being tracked. Transactional table (no _master_t suffix).
//
// state holds a status_master_t.status_key value for entity_type='tracking'
// (initiated → in_progress → completed → cancelled). The case-runtime
// drives this via the 'tracking_default' workflow seeded in
// src/db/seed/trackingWorkflow.ts.
//
// template_id pins this tracking run to one tracking_template_master_t row;
// the template's milestones_json is the source of truth for the per-step
// milestone chain (arrival → manifest → declaration → … for Import, etc.).
//
// current_milestone_key + milestones_completed_json track per-step progress
// inside the in_progress lifecycle stage. They're nullable on initiated
// rows. Per-milestone advancement (an /advance-milestone endpoint that
// appends to milestones_completed_json) is a follow-up slice — landing the
// case-runtime lifecycle first matches how every other §2 module shipped.

export const trackingT = pgTable('tracking_t', {
  id: serial('id').primaryKey(),
  trackingNumber: varchar('tracking_number', { length: 100 }).notNull().unique(),
  licenseId: integer('license_id')
    .notNull()
    .references(() => licenseT.id, { onDelete: 'restrict' }),
  templateId: integer('template_id')
    .notNull()
    .references(() => trackingTemplateMaster.id, { onDelete: 'restrict' }),
  state: varchar('state', { length: 50 }).notNull(),
  // Nullable while state='initiated' — populated by the per-milestone
  // advancement endpoint once it lands.
  currentMilestoneKey: varchar('current_milestone_key', { length: 50 }),
  // Append-only array of { key, completedAt, completedBy } objects. Empty
  // array on a fresh row (jsonb default '[]' isn't used so the column shape
  // matches the entity types — `null` is a valid "no milestones yet" value).
  milestonesCompletedJson: jsonb('milestones_completed_json'),
  startedAt: timestamp('started_at', { withTimezone: false }),
  completedAt: timestamp('completed_at', { withTimezone: false }),
  notes: text('notes'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const trackingRelations = relations(trackingT, ({ one }) => ({
  license: one(licenseT, {
    fields: [trackingT.licenseId],
    references: [licenseT.id],
  }),
  template: one(trackingTemplateMaster, {
    fields: [trackingT.templateId],
    references: [trackingTemplateMaster.id],
  }),
}));

export type TrackingRow = typeof trackingT.$inferSelect;
export type TrackingInsert = typeof trackingT.$inferInsert;
