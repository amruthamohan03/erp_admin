import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';

// Append-only audit log. EVERY user-initiated create/update/delete on
// audited entities lands here, written inside the same Drizzle transaction
// as the change itself. No UPDATE or DELETE against this table from app code.
//
// Snapshots in `before` / `after` are scrubbed of sensitive fields by
// [src/lib/audit/redact.ts](../../lib/audit/redact.ts) before insertion.
// `diff` is a shallow per-field { from, to } map so audit detail panels
// don't need to re-derive it on every render.
//
// metadata is free-form JSON — request id, IP, user agent, workflow
// transition id, reason text, etc.

export const auditLog = pgTable(
  'audit_log_t',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // NULL only for system / scheduled jobs (actor_type='system'). For user
    // actions this is the FK to users_t. ON DELETE SET NULL preserves the audit
    // row when a user is later removed (we keep history).
    actorId: integer('actor_id').references(() => usersT.id, {
      onDelete: 'set null',
    }),
    actorType: varchar('actor_type', { length: 10 }).notNull().default('user'),
    action: varchar('action', { length: 30 }).notNull(),
    // Free-form. Use the entity's snake-case table name without the _t suffix
    // for masters (e.g. 'client_master', 'invoice'), or 'page:<slug>' for
    // transactional-page edits.
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    diff: jsonb('diff'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    entityIdx: index('idx_audit_log_t_entity').on(t.entityType, t.entityId),
    actorIdx: index('idx_audit_log_t_actor').on(t.actorId),
    createdAtIdx: index('idx_audit_log_t_created_at').on(t.createdAt),
    actorTypeCheck: check(
      'audit_log_t_actor_type_check',
      sql`${t.actorType} IN ('user', 'system', 'api')`,
    ),
    actionCheck: check(
      'audit_log_t_action_check',
      sql`${t.action} IN ('create', 'update', 'delete', 'transition', 'login', 'logout', 'permission_change')`,
    ),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
