// §4.9 bulk-update config — each row maps a "pending/missing" filter on a
// transactional page to (a) a structured predicate that selects the matching
// rows and (b) the list of fields the bulk editor exposes for that filter.
//
// The predicate is a small JSON DSL (col + op, combined with all/any) translated
// to safe SQL server-side — column names are validated against the page's target
// whitelist and values are parameterized, so no raw SQL lives in this table.
// This keeps the PHP form's hardcoded filter→fields map as data instead of code.
import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const masterBulkFilter = pgTable(
  'master_bulk_filter_t',
  {
    id: serial('id').primaryKey(),
    // Which transactional page this filter belongs to (e.g. 'import').
    pageSlug: varchar('page_slug', { length: 100 }).notNull(),
    // Stable key used by the UI/API (e.g. 'crf_missing').
    filterKey: varchar('filter_key', { length: 100 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    // Predicate DSL: a leaf { col, op, value? } or { all: [...] } / { any: [...] }.
    // op ∈ isNull | isNotNull | empty | notEmpty | eq | neq.
    predicate: jsonb('predicate').notNull(),
    // Array of column names the bulk editor lets the user fill for this filter.
    editableFields: jsonb('editable_fields').notNull(),
    displayOrder: integer('display_order').notNull().default(1),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    pageFilterUq: uniqueIndex('uq_master_bulk_filter_t_page_filter').on(t.pageSlug, t.filterKey),
  }),
);

export type MasterBulkFilterRow = typeof masterBulkFilter.$inferSelect;
export type MasterBulkFilterInsert = typeof masterBulkFilter.$inferInsert;
