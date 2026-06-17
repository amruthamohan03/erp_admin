import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { licenseTypeMaster } from './licenseTypes';
import { usersT } from './users';

// Tracking template master per CLAUDE.md §2 step 3.
//
// One row per tracking workflow flavour — Import Tracking for IB licenses,
// Export Tracking for export licenses, etc. The template enumerates the
// ordered milestones a tracking instance passes through. A future
// tracking_t (transactional) will hold one row per consignment-being-
// tracked with a milestones_completed_json column or per-milestone status
// rows.
//
// Fiche de Calcul (the duties/taxes calculation tool referenced in §2)
// is configured separately via tax_rule_master_t — tracking templates can
// note which rules apply but the math lives in tax_rule_master_t.formula.
//
// milestones_json shape (validated by parseMilestones in
// src/lib/trackingTemplates.ts):
//
//   [
//     { "key": "arrival",     "label": "Goods arrived at port",   "order": 10 },
//     { "key": "declaration", "label": "Customs declaration filed", "order": 20 },
//     { "key": "duties_paid", "label": "Duties paid",              "order": 30 },
//     { "key": "released",    "label": "Goods released",            "order": 40 }
//   ]
//
// license_type_id pins the template to one license kind so a single client
// can have different tracking flows for import vs export licenses.

export const trackingTemplateMaster = pgTable('tracking_template_master_t', {
  id: serial('id').primaryKey(),
  templateKey: varchar('template_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  licenseTypeId: integer('license_type_id')
    .notNull()
    .references(() => licenseTypeMaster.id, { onDelete: 'restrict' }),
  milestonesJson: jsonb('milestones_json').notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type TrackingTemplateMasterRow = typeof trackingTemplateMaster.$inferSelect;
export type TrackingTemplateMasterInsert = typeof trackingTemplateMaster.$inferInsert;
