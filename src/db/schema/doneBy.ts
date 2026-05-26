// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `done_by_t`
// because the user asked to mirror the source DB naming exactly.
// Note: source schema for done_by_t has no created_by/updated_by columns —
// we follow the source exactly here. Audit trail still lives in audit_log (§4.10).
import {
  pgTable,
  serial,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';

export const doneBy = pgTable('done_by_t', {
  id: serial('id').primaryKey(),
  doneByName: varchar('done_by_name', { length: 50 }).notNull().unique(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type DoneByRow = typeof doneBy.$inferSelect;
export type DoneByInsert = typeof doneBy.$inferInsert;
