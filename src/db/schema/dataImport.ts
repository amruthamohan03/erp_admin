import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Data Import — upload a spreadsheet or a scanned document, review what was
// read, and create the records through the module's OWN save route.
//
// Nothing here writes a business row: the importer posts each reviewed row to
// the same endpoint the screen posts to, so every validation, derive and hook
// applies exactly as if a person had typed it (§4.10). These tables only decide
// WHAT can be imported and record WHAT WAS.
//
//   import_target_master_t      — the modules the dropdown offers (§4.1)
//   import_field_alias_master_t — spreadsheet headings taught to the importer,
//                                 so "Nom du client" maps itself next time
//   import_batch_t / _row_t     — one upload and what became of each row

export const IMPORT_HANDLERS = ['page', 'users'] as const;
export type ImportHandler = (typeof IMPORT_HANDLERS)[number];

export const IMPORT_BATCH_STATUSES = ['parsed', 'committed', 'failed'] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

/** A module the importer can create records in. */
export const importTargetMaster = pgTable('import_target_master_t', {
  id: serial('id').primaryKey(),
  targetKey: varchar('target_key', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  /** How the rows are written: through a transaction page, or the users API. */
  handler: varchar('handler', { length: 20 }).notNull(),
  /** `page` handler — the master_page slug whose fields and save route are used. */
  pageSlug: varchar('page_slug', { length: 60 }),
  /** The menu the importer checks the operator's Import permission against. */
  menuUrl: varchar('menu_url', { length: 200 }).notNull(),
  /** Shown under the picker: what one row of the file should contain. */
  hint: text('hint'),
  displayOrder: integer('display_order').notNull().default(0),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

/** A column heading (or document label) that means one of a target's fields. */
export const importFieldAliasMaster = pgTable(
  'import_field_alias_master_t',
  {
    id: serial('id').primaryKey(),
    targetId: integer('target_id')
      .notNull()
      .references(() => importTargetMaster.id, { onDelete: 'cascade' }),
    fieldName: varchar('field_name', { length: 100 }).notNull(),
    /** Stored upper-cased and stripped of punctuation — see normaliseHeading. */
    alias: varchar('alias', { length: 150 }).notNull(),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({ aliasUq: uniqueIndex('uq_import_field_alias').on(t.targetId, t.alias) }),
);

/** One upload. */
export const importBatch = pgTable(
  'import_batch_t',
  {
    id: serial('id').primaryKey(),
    targetKey: varchar('target_key', { length: 60 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** 'spreadsheet' | 'document' — a sheet of rows, or a scan read by the model. */
    source: varchar('source', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('parsed'),
    rowCount: integer('row_count').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    /** Which file column fed which field, as committed. */
    mapping: jsonb('mapping'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({ createdIdx: index('idx_import_batch_t_created').on(t.createdAt) }),
);

/** What became of one row of that upload. */
export const importBatchRow = pgTable(
  'import_batch_row_t',
  {
    id: serial('id').primaryKey(),
    batchId: integer('batch_id')
      .notNull()
      .references(() => importBatch.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    /** The values sent to the module's save route. */
    values: jsonb('values'),
    /** The id created, when it was. */
    recordId: integer('record_id'),
    /** Why it was refused — the module's own message (§4.23). */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({ batchIdx: index('idx_import_batch_row_t_batch').on(t.batchId) }),
);

export type ImportTargetMasterRow = typeof importTargetMaster.$inferSelect;
export type ImportBatchRow = typeof importBatch.$inferSelect;
