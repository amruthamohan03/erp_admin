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
    // §4.28 — captured per action rather than resolved later. actorRole is
    // deliberately denormalised: it records the role the actor HELD at the time,
    // which a join to users_t could no longer answer once their role changes.
    actorRole: varchar('actor_role', { length: 100 }),
    /** Which part of the app the action happened in — drives the module views. */
    module: varchar('module', { length: 100 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
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
    moduleIdx: index('idx_audit_log_t_module').on(t.module),
    actionIdx: index('idx_audit_log_t_action').on(t.action),
    actorIdx: index('idx_audit_log_t_actor').on(t.actorId),
    createdAtIdx: index('idx_audit_log_t_created_at').on(t.createdAt),
    actorTypeCheck: check(
      'audit_log_t_actor_type_check',
      sql`${t.actorType} IN ('user', 'system', 'api')`,
    ),
    actionCheck: check(
      'audit_log_t_action_check',
      sql`${t.action} IN (
        'login', 'logout', 'failed_login',
        'create', 'view', 'update',
        'delete', 'restore', 'permanent_delete',
        'approve', 'reject', 'submit', 'cancel',
        'export', 'import', 'download', 'print',
        'status_change', 'role_change', 'permission_change', 'user_change',
        'settings_change', 'transition'
      )`,
    ),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
