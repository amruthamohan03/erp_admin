import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

// Registry of every uploaded file. Postgres holds the metadata
// pointer (bucket + key + size + mime + sha256 + original name +
// uploader + the entity it's attached to), the bytes live in the
// storage backend (local filesystem under public/uploads/ for now,
// S3 once credentials are wired — see src/lib/storage/).
//
// `status` lifecycle:
//   pending     — row created, bytes not yet committed (presigned
//                 upload in flight). Currently always created as
//                 'committed' because the local backend writes
//                 atomically in the upload handler.
//   committed   — bytes are written and verified.
//   quarantined — virus / malware scan flagged the file.
//   deleted     — soft-delete; bytes are removed from the backend
//                 but the row stays for audit.
//
// entity_type + entity_id pin the attachment target:
//   * entity_type is the underscore-cased table name without the _t
//     suffix ('import', 'export', 'client', 'invoice', …)
//   * entity_id is the row id as text (so it can hold non-int ids
//     if any entity ever needs them)
//
// Per CLAUDE.md §4.11 — this closes the long-standing "file uploads"
// TODO. Per-entity FK wiring (e.g. imports.inspection_reports_file_id)
// happens in separate slices once consumers actually need the link.

export const filesT = pgTable(
  'files_t',
  {
    id: serial('id').primaryKey(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    key: text('key').notNull(),
    mime: varchar('mime', { length: 255 }),
    size: bigint('size', { mode: 'number' }),
    sha256: varchar('sha256', { length: 64 }),
    originalName: varchar('original_name', { length: 500 }).notNull(),
    uploaderId: integer('uploader_id').references(() => usersT.id, {
      onDelete: 'set null',
    }),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: varchar('entity_id', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('committed'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    entityIdx: index('idx_files_t_entity').on(t.entityType, t.entityId),
    statusIdx: index('idx_files_t_status').on(t.status),
    statusCheck: check(
      'files_t_status_check',
      sql`${t.status} IN ('pending', 'committed', 'quarantined', 'deleted')`,
    ),
  }),
);

export type FileRow = typeof filesT.$inferSelect;
export type FileInsert = typeof filesT.$inferInsert;
