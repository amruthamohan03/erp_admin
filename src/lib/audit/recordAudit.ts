// Single entry point for audit writes. ALL audit insertions go through this
// helper so the shape (snapshots redacted, diff pre-computed) stays
// consistent across modules. Must be called inside the same Drizzle
// transaction as the change it describes — pass `tx`, not `db`.
import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '@/lib/db';
import { auditLog } from '@/db/schema';
import { redact } from './redact';

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
 * Append a row to audit_log_t. Pass the active transaction — passing the
 * global `db` breaks the "audit rolls back with the write" invariant.
 *
 * Returns the inserted row id. audit_log_t is append-only; never UPDATE or
 * DELETE the row from app code.
 */
export async function recordAudit(
  tx: Database | Transaction,
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
      createdAt: sql`now()` as unknown as Date,
    })
    .returning({ id: auditLog.id });

  return row.id;
}
