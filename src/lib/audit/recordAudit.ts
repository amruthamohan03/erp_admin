// §4.10 — single entry point for audit writes. ALL audit insertions go through
// this helper so the shape stays consistent. Must be called inside the same
// Drizzle transaction as the change it describes (pass `tx`, not `db`).
import { sql } from 'drizzle-orm';
import type { db as defaultDb } from '@/lib/db';
import { auditLog } from '@/db/schema';
import { redact } from './redact';

type DbLike = typeof defaultDb;

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'transition'
  | 'login'
  | 'logout'
  | 'permission_change';

export type AuditActorType = 'user' | 'system' | 'api';

export interface RecordAuditArgs {
  actorId: number | null;
  actorType?: AuditActorType;
  action: AuditAction;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Compute a shallow per-field diff of two snapshots. Keys present in either
 * snapshot show as `{ from, to }` if values differ. Used for fast-rendering
 * audit detail panels without re-deriving from `before` / `after`.
 */
function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before && !after) return null;
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diff[key] = { from, to };
    }
  }
  return Object.keys(diff).length === 0 ? null : diff;
}

function asSnapshot(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  return redact(v as Record<string, unknown>);
}

/**
 * Append a row to audit_log. Pass the active transaction (`tx`) — if you pass
 * the global `db` you break §4.10 rule 2 (audit must roll back with the write).
 *
 * Returns the inserted row id. Don't try to update or delete it later —
 * audit_log is append-only.
 */
export async function recordAudit(
  tx: DbLike,
  args: RecordAuditArgs,
): Promise<string> {
  const before = asSnapshot(args.before);
  const after = asSnapshot(args.after);
  const diff = computeDiff(before, after);

  const [row] = await tx
    .insert(auditLog)
    .values({
      actorId: args.actorId,
      actorType: args.actorType ?? (args.actorId ? 'user' : 'system'),
      action: args.action,
      entityType: args.entityType,
      entityId: String(args.entityId),
      before,
      after,
      diff,
      metadata: args.metadata ?? null,
      // Don't set createdAt manually — let the DB default apply via NOW().
      // Drizzle's withTimezone column is fine to omit since defaultNow() is set.
      createdAt: sql`now()` as unknown as Date,
    })
    .returning({ id: auditLog.id });

  return row.id;
}
