// §4.28 — the read side of the audit trail.
//
// Read-only by construction: this module exports no update and no delete. The
// table is append-only, and the only writer is recordAudit().
import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog, usersT } from '@/db/schema';

export interface AuditFilters {
  q?: string;
  actorId?: number;
  module?: string;
  action?: string;
  /** Inclusive, YYYY-MM-DD. */
  from?: string;
  to?: string;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_type: string;
  action: string;
  module: string | null;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  user_agent: string | null;
  /** Number of fields that changed — the full diff comes from the detail call. */
  change_count: number;
}

function whereFor(f: AuditFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.actorId) conds.push(eq(auditLog.actorId, f.actorId));
  if (f.module) conds.push(eq(auditLog.module, f.module));
  if (f.action) conds.push(eq(auditLog.action, f.action));
  // A date is inclusive of the whole day: `to` compares against the next
  // midnight, otherwise "to today" silently excludes everything done today.
  if (f.from) conds.push(gte(auditLog.createdAt, new Date(`${f.from}T00:00:00`)));
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    conds.push(lte(auditLog.createdAt, end));
  }
  const term = f.q?.trim();
  if (term) {
    const like = `%${term}%`;
    conds.push(
      or(
        ilike(auditLog.entityType, like),
        ilike(auditLog.entityId, like),
        ilike(auditLog.module, like),
        ilike(auditLog.actorRole, like),
        ilike(usersT.fullName, like),
      ) as SQL,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listAudit(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<{ items: AuditEntry[]; total: number }> {
  const where = whereFor(filters);

  const [countRow] = await db
    .select({ total: count() })
    .from(auditLog)
    .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
    .where(where);

  const rows = await db
    .select({
      id: auditLog.id,
      created_at: auditLog.createdAt,
      actor_id: auditLog.actorId,
      actor_name: usersT.fullName,
      actor_role: auditLog.actorRole,
      actor_type: auditLog.actorType,
      action: auditLog.action,
      module: auditLog.module,
      entity_type: auditLog.entityType,
      entity_id: auditLog.entityId,
      ip_address: auditLog.ipAddress,
      user_agent: auditLog.userAgent,
      // Counted in SQL so the list does not ship every diff just to show "3 fields".
      change_count: sql<number>`coalesce(jsonb_array_length(
        case when jsonb_typeof(${auditLog.diff}) = 'object'
             then (select jsonb_agg(k) from jsonb_object_keys(${auditLog.diff}) k)
             else null end), 0)`,
    })
    .from(auditLog)
    .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((r) => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      change_count: Number(r.change_count ?? 0),
    })),
    total: Number(countRow?.total ?? 0),
  };
}

export interface AuditDetail extends AuditEntry {
  before: unknown;
  after: unknown;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
}

export async function getAuditEntry(id: string): Promise<AuditDetail | null> {
  const [row] = await db
    .select({
      id: auditLog.id,
      created_at: auditLog.createdAt,
      actor_id: auditLog.actorId,
      actor_name: usersT.fullName,
      actor_role: auditLog.actorRole,
      actor_type: auditLog.actorType,
      action: auditLog.action,
      module: auditLog.module,
      entity_type: auditLog.entityType,
      entity_id: auditLog.entityId,
      ip_address: auditLog.ipAddress,
      user_agent: auditLog.userAgent,
      before: auditLog.before,
      after: auditLog.after,
      diff: auditLog.diff,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
    .where(eq(auditLog.id, id))
    .limit(1);

  if (!row) return null;
  const diff = (row.diff ?? null) as AuditDetail['diff'];
  return {
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    diff,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    change_count: diff ? Object.keys(diff).length : 0,
  };
}

export interface AuditStats {
  total: number;
  today: number;
  data_changes: number;
  logins: number;
  deletes: number;
  restores: number;
  by_action: Array<{ key: string; count: number }>;
  by_module: Array<{ key: string; count: number }>;
  by_user: Array<{ key: string; count: number }>;
  by_day: Array<{ key: string; count: number }>;
}

/**
 * Every figure on the dashboard, computed in SQL over live rows (§4.29).
 *
 * Honours the same filters as the list, so the cards describe what the operator
 * is actually looking at rather than the whole table.
 */
export async function auditStats(filters: AuditFilters): Promise<AuditStats> {
  const where = whereFor(filters);
  const [totals] = await db
    .select({
      total: count(),
      today: sql<number>`count(*) filter (where ${auditLog.createdAt} >= date_trunc('day', now()))`,
      data_changes: sql<number>`count(*) filter (where ${auditLog.action} in ('create','update','delete','restore','permanent_delete'))`,
      logins: sql<number>`count(*) filter (where ${auditLog.action} in ('login','logout','failed_login'))`,
      deletes: sql<number>`count(*) filter (where ${auditLog.action} in ('delete','permanent_delete'))`,
      restores: sql<number>`count(*) filter (where ${auditLog.action} = 'restore')`,
    })
    .from(auditLog)
    .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
    .where(where);

  const group = async (col: SQL, limit: number) => {
    const rows = await db
      .select({ key: sql<string>`coalesce(${col}::text, 'unknown')`, count: count() })
      .from(auditLog)
      .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
      .where(where)
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(limit);
    return rows.map((r) => ({ key: String(r.key), count: Number(r.count) }));
  };

  const [by_action, by_module, by_user] = await Promise.all([
    group(sql`${auditLog.action}`, 20),
    group(sql`${auditLog.module}`, 20),
    group(sql`coalesce(${usersT.fullName}, 'system')`, 10),
  ]);

  // Daily trend over the last 30 days, oldest first so a chart reads left to right.
  const dayRows = await db
    .select({
      key: sql<string>`to_char(date_trunc('day', ${auditLog.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(auditLog)
    .leftJoin(usersT, eq(usersT.id, auditLog.actorId))
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`)
    .limit(30);

  return {
    total: Number(totals?.total ?? 0),
    today: Number(totals?.today ?? 0),
    data_changes: Number(totals?.data_changes ?? 0),
    logins: Number(totals?.logins ?? 0),
    deletes: Number(totals?.deletes ?? 0),
    restores: Number(totals?.restores ?? 0),
    by_action,
    by_module,
    by_user,
    by_day: dayRows.map((r) => ({ key: String(r.key), count: Number(r.count) })).reverse(),
  };
}

/** Distinct values for the filter dropdowns. */
export async function auditFilterOptions(): Promise<{
  modules: string[];
  actions: string[];
  users: Array<{ id: number; name: string }>;
}> {
  const [modules, actions, users] = await Promise.all([
    db.selectDistinct({ v: auditLog.module }).from(auditLog).orderBy(auditLog.module),
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db
      .selectDistinct({ id: usersT.id, name: usersT.fullName })
      .from(auditLog)
      .innerJoin(usersT, eq(usersT.id, auditLog.actorId))
      .orderBy(usersT.fullName),
  ]);
  return {
    modules: modules.map((m) => m.v).filter((v): v is string => !!v),
    actions: actions.map((a) => a.v).filter((v): v is string => !!v),
    users: users.map((u) => ({ id: u.id, name: u.name ?? `#${u.id}` })),
  };
}

/** Every matching row, for the Excel export. Capped so one click cannot OOM. */
export async function auditForExport(filters: AuditFilters, limit = 10000): Promise<AuditEntry[]> {
  const { items } = await listAudit(filters, 1, limit);
  return items;
}
