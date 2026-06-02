// §4.10 — append-only audit log. EVERY user-initiated create/update/delete on
// audited entities lands here, written inside the same Drizzle transaction as
// the change itself. No UPDATE or DELETE against this table from app code.
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

export const auditLog = pgTable(
  'audit_log_t',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // NULL only for system / scheduled jobs (actor_type='system'). For user
    // actions this is the FK to users_t. ON DELETE SET NULL preserves the audit
    // row when a user is later removed (we keep history).
    actorId: integer('actor_id').references(() => usersT.id, { onDelete: 'set null' }),
    // CHECK constraint in migration: 'user' | 'system' | 'api'.
    actorType: varchar('actor_type', { length: 10 }).notNull().default('user'),
    // CHECK constraint in migration: limited set of action verbs.
    action: varchar('action', { length: 30 }).notNull(),
    // Free-form. For transactional-page edits use 'page:<slug>' (e.g. 'page:clients').
    // For master-CRUD edits use the master table slug (e.g. 'industries').
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    diff: jsonb('diff'),
    // Free-form JSON for request id, IP, user agent, accordion slug + field name
    // for §4.12 page audits, workflow transition id, reason text, etc.
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entityIdx: index('idx_audit_log_t_entity').on(t.entityType, t.entityId),
    actorIdx: index('idx_audit_log_t_actor').on(t.actorId),
    createdAtIdx: index('idx_audit_log_t_created_at').on(t.createdAt),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
