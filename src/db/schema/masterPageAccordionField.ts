// §4.12 — inputs inside an accordion. Every input on every transactional page
// is bound to a row here. `name` is the column in the page's target table.
//
// `field_type` drives the renderer. `options_source` (slug) wires a select to
// an existing master endpoint (e.g. 'industries', 'group-companies'). `props`
// carries everything else (min/max, pattern, accept, max_size_kb, etc.) as JSON
// so we don't have to add a column per knob.
import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { masterPageAccordion } from './masterPageAccordion';

export const masterPageAccordionField = pgTable(
  'master_page_accordion_field_t',
  {
    id: serial('id').primaryKey(),
    accordionId: integer('accordion_id')
      .notNull()
      .references(() => masterPageAccordion.id, { onDelete: 'cascade' }),
    // Column name in the page's target table. The runtime maps this through
    // a server-side whitelist of expected columns — never trusted as a SQL
    // identifier directly.
    name: varchar('name', { length: 100 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    // CHECK constraint in migration restricts to a known field-type enum.
    fieldType: varchar('field_type', { length: 30 }).notNull(),
    required: boolean('required').notNull().default(false),
    // For dynamic selects: the slug of the master endpoint to populate options from
    // (e.g. 'industries' → fetches from /api/industries). NULL for non-select fields.
    optionsSource: varchar('options_source', { length: 100 }),
    // For dynamic selects: which field in the response holds the user-visible label.
    optionsLabelField: varchar('options_label_field', { length: 100 }),
    // For static option groups (radio / checkbox-group / static select):
    // [{ value: 'I', label: 'Import' }, ...].
    optionsStatic: jsonb('options_static'),
    // Catch-all for renderer hints: min/max/pattern/accept/maxSizeKb/rows/cols/etc.
    props: jsonb('props'),
    // §4.5/§4.12 — config-driven conditional logic: visibleWhen / requiredWhen /
    // readonlyWhen predicates + min/max bounds, all keyed off other field values.
    // NULL ⇒ the field behaves statically (back-compat). See migration 0056 and
    // src/lib/pages/conditions.ts for the shape + evaluator.
    conditions: jsonb('conditions'),
    // §4.5/§4.12 — config-driven DERIVED value (statusMap / formula / fromRelated
    // / template). NULL ⇒ a plain field. See migration 0059 + src/lib/pages/derive.ts.
    derive: jsonb('derive'),
    displayOrder: integer('display_order').notNull().default(1),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    accordionNameUq: uniqueIndex('uq_master_page_accordion_field_t_acc_name').on(t.accordionId, t.name),
  }),
);

export type MasterPageAccordionFieldRow = typeof masterPageAccordionField.$inferSelect;
export type MasterPageAccordionFieldInsert = typeof masterPageAccordionField.$inferInsert;
