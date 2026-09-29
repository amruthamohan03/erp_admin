import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// §4.1 — the invoice grid's column headings, as rows an operator maintains.
//
// `grid_key` names one of the three column SETS the grid draws (import-cdf,
// import-usd, export-usd) and `column_key` one of the columns that set has —
// both vetted in src/lib/invoiceGrid/columns.ts, because a column key names a
// field the renderer reads off a line. An operator renames a column; they
// cannot invent one the grid has no value for.
//
// `category_id` is NULL for a heading that applies to every category drawn with
// that set — which is all of them today. The column exists so a per-category
// override ("Government Taxes & Duties" naming its columns differently from
// "Bank & SEGUCE Charges") is a row and a screen, never a migration.

export const invoiceGridHeadingMaster = pgTable(
  'invoice_grid_heading_master_t',
  {
    id: serial('id').primaryKey(),
    gridKey: varchar('grid_key', { length: 30 }).notNull(),
    columnKey: varchar('column_key', { length: 30 }).notNull(),
    // NULL = every category using this grid. Set = that category only, winning
    // over the NULL row.
    categoryId: integer('category_id'),
    heading: varchar('heading', { length: 60 }).notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // One heading per column per scope. NULL does not compare equal to NULL in
    // a unique index, so the general rows are constrained by a separate partial
    // index in the migration rather than by this one.
    gridColumnUq: uniqueIndex('uq_invoice_grid_heading_scoped').on(
      t.gridKey,
      t.columnKey,
      t.categoryId,
    ),
  }),
);

export type InvoiceGridHeadingRow = typeof invoiceGridHeadingMaster.$inferSelect;
export type InvoiceGridHeadingInsert = typeof invoiceGridHeadingMaster.$inferInsert;
