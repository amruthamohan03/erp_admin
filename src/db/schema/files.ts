// §4.11 — registry for every object stored in S3. Postgres holds the pointer +
// metadata, never the bytes. A row may be 'pending' briefly (presign issued,
// upload not yet committed); commit flips it to 'committed'.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const files = pgTable(
  'files_t',
  {
    id: serial('id').primaryKey(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    key: text('key').notNull(),
    mime: varchar('mime', { length: 255 }),
    size: bigint('size', { mode: 'number' }),
    sha256: varchar('sha256', { length: 64 }),
    originalName: varchar('original_name', { length: 500 }).notNull(),
    uploaderId: integer('uploader_id').references(() => usersT.id),
    // What the file is attached to: entity_type e.g. 'page:clients', entity_id the row id.
    entityType: varchar('entity_type', { length: 100 }),
    entityId: varchar('entity_id', { length: 100 }),
    // CHECK in migration: pending | committed | quarantined | deleted.
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entityIdx: index('idx_files_t_entity').on(t.entityType, t.entityId),
    statusIdx: index('idx_files_t_status').on(t.status),
  }),
);

export type FileRow = typeof files.$inferSelect;
export type FileInsert = typeof files.$inferInsert;
