// In-app notifications and role messages — the one inbox behind the header bell,
// the dashboard panel, /notifications and /messages. See db/schema/notifications.ts.
//
// Raising an event is the ONLY thing a module does in code: it names the event
// and hands over what happened. Whether anyone is told, which roles, and in what
// words is the event's row in notification_event_master_t (§4.1). An event with
// no row, a switched-off row, or no one to tell raises nothing — a notification
// is a courtesy, never a reason for the change it describes to fail.
import { sql, type SQL } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { renderTemplate, type TemplateContext } from '@/lib/notificationTemplate';
import type { NotificationKind, NotificationPriority } from '@/db/schema';

type Exec = Database | Transaction;
type Rows<T> = { rows: T[] };

// ---------------------------------------------------------------------------
// RAISING AN EVENT
// ---------------------------------------------------------------------------

export interface RaiseEventInput {
  /** Who did it — named in the text as {actor}, and not notified of their own act. */
  actorUserId: number | null;
  /** Who created the record — told too when the event says `notify_creator`. */
  creatorUserId?: number | null;
  /** Filled into the event's templates: {ref}, {stage}, {reason}, … */
  context?: TemplateContext;
}

/**
 * Announce a status change. Call it inside the transaction that made the change,
 * so a rolled-back approval never tells anyone it happened.
 */
export async function raiseEvent(exec: Exec, eventKey: string, input: RaiseEventInput): Promise<number | null> {
  const ev = await exec.execute(sql`
    SELECT e.id, e.module, e.title_template, e.message_template, e.link_template, e.notify_creator, e.priority,
           COALESCE(array_agg(r.role_id) FILTER (WHERE r.role_id IS NOT NULL), '{}') AS role_ids
    FROM notification_event_master_t e
    LEFT JOIN notification_event_role_t r ON r.event_id = e.id
    WHERE e.event_key = ${eventKey} AND e.display = 'Y'
    GROUP BY e.id`);
  const event = (ev as unknown as Rows<{
    id: number; module: string; title_template: string; message_template: string; link_template: string | null;
    notify_creator: boolean; priority: string; role_ids: number[];
  }>).rows[0];
  if (!event) return null;

  const creator = event.notify_creator && input.creatorUserId && input.creatorUserId !== input.actorUserId
    ? input.creatorUserId
    : null;
  if (event.role_ids.length === 0 && !creator) return null;

  const who = input.actorUserId
    ? ((await exec.execute(sql`
        SELECT u.full_name, r.role_name FROM users_t u LEFT JOIN role_master_t r ON r.id = u.role_id
        WHERE u.id = ${input.actorUserId}`)) as unknown as Rows<{ full_name: string | null; role_name: string | null }>).rows[0]
    : undefined;
  const context: TemplateContext = { actor: who?.full_name ?? 'System', actor_role: who?.role_name ?? '', ...input.context };

  const inserted = await exec.execute(sql`
    INSERT INTO notification_t (kind, event_key, module, title, body, link_url, priority, sender_user_id, sender_role_id)
    VALUES ('event', ${eventKey}, ${event.module},
            ${renderTemplate(event.title_template, context).slice(0, 200)},
            ${renderTemplate(event.message_template, context)},
            ${event.link_template ? renderTemplate(event.link_template, context).slice(0, 300) : null},
            ${event.priority}, ${input.actorUserId},
            (SELECT role_id FROM users_t WHERE id = ${input.actorUserId ?? 0}))
    RETURNING id`);
  const id = (inserted as unknown as Rows<{ id: number }>).rows[0]!.id;

  const recipients: SQL[] = [
    ...event.role_ids.map((roleId) => sql`(${id}, ${roleId}, NULL::int)`),
    ...(creator ? [sql`(${id}, NULL::int, ${creator})`] : []),
  ];
  await exec.execute(sql`
    INSERT INTO notification_recipient_t (notification_id, role_id, user_id) VALUES ${sql.join(recipients, sql`, `)}`);
  return id;
}

// ---------------------------------------------------------------------------
// ROLE MESSAGES
// ---------------------------------------------------------------------------

export interface SendMessageInput {
  senderUserId: number;
  senderRoleId: number;
  roleIds: number[];
  subject: string;
  body: string;
  priority: NotificationPriority;
}

export async function sendMessage(input: SendMessageInput): Promise<{ id: number; roles: string[] }> {
  return db.transaction(async (tx) => {
    const roles = (await tx.execute(sql`
      SELECT id, role_name FROM role_master_t
      WHERE display = 'Y' AND id IN (${sql.join(input.roleIds.map((r) => sql`${r}`), sql`, `)})`)) as unknown as Rows<{
      id: number; role_name: string;
    }>;
    if (roles.rows.length !== input.roleIds.length) {
      throw new ValidationError('To: one of the chosen roles no longer exists — reload the page and choose again.', { field: 'role_ids' });
    }
    const inserted = await tx.execute(sql`
      INSERT INTO notification_t (kind, module, title, body, priority, sender_user_id, sender_role_id)
      VALUES ('message', 'messages', ${input.subject}, ${input.body}, ${input.priority}, ${input.senderUserId}, ${input.senderRoleId})
      RETURNING id`);
    const id = (inserted as unknown as Rows<{ id: number }>).rows[0]!.id;
    await tx.execute(sql`
      INSERT INTO notification_recipient_t (notification_id, role_id)
      VALUES ${sql.join(input.roleIds.map((r) => sql`(${id}, ${r})`), sql`, `)}`);
    await recordAudit(tx, {
      actorId: input.senderUserId,
      action: 'create',
      entityType: 'role_message',
      entityId: id,
      after: { subject: input.subject, role_ids: input.roleIds, priority: input.priority },
    });
    return { id, roles: roles.rows.map((r) => r.role_name) };
  });
}

// ---------------------------------------------------------------------------
// THE INBOX
// ---------------------------------------------------------------------------

export interface Reader {
  userId: number;
  roleId: number;
}

/** What this user may see: addressed to their role or to them, and not their own. */
function visibleTo(reader: Reader): SQL {
  return sql`n.display = 'Y'
    AND n.sender_user_id IS DISTINCT FROM ${reader.userId}
    AND EXISTS (
      SELECT 1 FROM notification_recipient_t r
      WHERE r.notification_id = n.id AND (r.role_id = ${reader.roleId} OR r.user_id = ${reader.userId}))`;
}

const isRead = (reader: Reader): SQL =>
  sql`EXISTS (SELECT 1 FROM notification_read_t rd WHERE rd.notification_id = n.id AND rd.user_id = ${reader.userId})`;

export interface InboxItem {
  id: number;
  kind: NotificationKind;
  event_key: string | null;
  module: string | null;
  title: string;
  body: string;
  link_url: string | null;
  priority: NotificationPriority;
  sender_name: string | null;
  sender_role: string | null;
  created_at: string;
  read: boolean;
}

export interface InboxQuery {
  kind?: NotificationKind;
  unread?: boolean;
  q?: string;
  page: number;
  pageSize: number;
}

export async function inbox(reader: Reader, query: InboxQuery): Promise<{ items: InboxItem[]; total: number }> {
  const conds: SQL[] = [visibleTo(reader)];
  if (query.kind) conds.push(sql`n.kind = ${query.kind}`);
  if (query.unread) conds.push(sql`NOT ${isRead(reader)}`);
  const term = query.q?.trim();
  if (term) {
    const like = `%${term}%`;
    conds.push(sql`(n.title ILIKE ${like} OR n.body ILIKE ${like} OR u.full_name ILIKE ${like} OR sr.role_name ILIKE ${like}
      OR to_char(n.created_at, 'DD-MM-YYYY') ILIKE ${like})`);
  }
  const where = sql.join(conds, sql` AND `);
  const from = sql`FROM notification_t n
    LEFT JOIN users_t u ON u.id = n.sender_user_id
    LEFT JOIN role_master_t sr ON sr.id = n.sender_role_id`;
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT n.id, n.kind, n.event_key, n.module, n.title, n.body, n.link_url, n.priority,
             u.full_name AS sender_name, sr.role_name AS sender_role,
             to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
             ${isRead(reader)} AS read
      ${from} WHERE ${where}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${where}`),
  ]);
  return {
    items: (rows as unknown as Rows<InboxItem>).rows,
    total: (count as unknown as Rows<{ n: number }>).rows[0]?.n ?? 0,
  };
}

export async function unreadCounts(reader: Reader): Promise<{ total: number; messages: number; events: number }> {
  const rows = await db.execute(sql`
    SELECT count(*) FILTER (WHERE n.kind = 'message')::int AS messages,
           count(*) FILTER (WHERE n.kind = 'event')::int AS events
    FROM notification_t n
    WHERE ${visibleTo(reader)} AND NOT ${isRead(reader)}`);
  const r = (rows as unknown as Rows<{ messages: number; events: number }>).rows[0] ?? { messages: 0, events: 0 };
  return { total: r.messages + r.events, messages: r.messages, events: r.events };
}

/** Mark read — the given ones, or everything this user can see (of one kind). */
export async function markRead(reader: Reader, ids: number[] | 'all', kind?: NotificationKind): Promise<number> {
  const scope = ids === 'all'
    ? kind ? sql`AND n.kind = ${kind}` : sql``
    : sql`AND n.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;
  const res = await db.execute(sql`
    INSERT INTO notification_read_t (notification_id, user_id)
    SELECT n.id, ${reader.userId} FROM notification_t n
    WHERE ${visibleTo(reader)} ${scope}
    ON CONFLICT DO NOTHING`);
  return (res as unknown as { rowCount?: number }).rowCount ?? 0;
}

export interface SentMessage {
  id: number;
  title: string;
  body: string;
  priority: NotificationPriority;
  created_at: string;
  roles: string;
  read_count: number;
}

/** Messages this user sent, with who they went to and how many have read them. */
export async function sentMessages(userId: number): Promise<SentMessage[]> {
  const rows = await db.execute(sql`
    SELECT n.id, n.title, n.body, n.priority,
           to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           (SELECT string_agg(ro.role_name, ', ' ORDER BY ro.id) FROM notification_recipient_t r
              JOIN role_master_t ro ON ro.id = r.role_id WHERE r.notification_id = n.id) AS roles,
           (SELECT count(*)::int FROM notification_read_t rd WHERE rd.notification_id = n.id) AS read_count
    FROM notification_t n
    WHERE n.kind = 'message' AND n.display = 'Y' AND n.sender_user_id = ${userId}
    ORDER BY n.created_at DESC
    LIMIT 500`);
  return (rows as unknown as Rows<SentMessage>).rows;
}

// ---------------------------------------------------------------------------
// THE EVENT MASTER
// ---------------------------------------------------------------------------

export interface NotificationEventRow {
  id: number;
  event_key: string;
  module: string;
  name: string;
  title_template: string;
  message_template: string;
  link_template: string | null;
  notify_creator: boolean;
  priority: NotificationPriority;
  display: 'Y' | 'N';
  role_ids: number[];
  role_names: string | null;
}

export async function listNotificationEvents(): Promise<NotificationEventRow[]> {
  const rows = await db.execute(sql`
    SELECT e.id, e.event_key, e.module, e.name, e.title_template, e.message_template, e.link_template,
           e.notify_creator, e.priority, e.display,
           COALESCE(array_agg(r.role_id ORDER BY r.role_id) FILTER (WHERE r.role_id IS NOT NULL), '{}') AS role_ids,
           string_agg(ro.role_name, ', ' ORDER BY ro.id) AS role_names
    FROM notification_event_master_t e
    LEFT JOIN notification_event_role_t r ON r.event_id = e.id
    LEFT JOIN role_master_t ro ON ro.id = r.role_id
    GROUP BY e.id
    ORDER BY e.id`);
  return (rows as unknown as Rows<NotificationEventRow>).rows;
}

export interface NotificationEventUpdate {
  name: string;
  title_template: string;
  message_template: string;
  link_template: string | null;
  notify_creator: boolean;
  priority: NotificationPriority;
  display: 'Y' | 'N';
  role_ids: number[];
}

export async function updateNotificationEvent(id: number, input: NotificationEventUpdate, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const before = (await tx.execute(sql`
      SELECT e.*, COALESCE(array_agg(r.role_id ORDER BY r.role_id) FILTER (WHERE r.role_id IS NOT NULL), '{}') AS role_ids
      FROM notification_event_master_t e LEFT JOIN notification_event_role_t r ON r.event_id = e.id
      WHERE e.id = ${id} GROUP BY e.id FOR UPDATE OF e`)) as unknown as Rows<Record<string, unknown>>;
    if (!before.rows[0]) throw new NotFoundError('This notification event no longer exists — reload the page.');

    await tx.execute(sql`
      UPDATE notification_event_master_t SET
        name = ${input.name}, title_template = ${input.title_template}, message_template = ${input.message_template},
        link_template = ${input.link_template}, notify_creator = ${input.notify_creator}, priority = ${input.priority},
        display = ${input.display}, updated_by = ${actorId}, updated_at = now()
      WHERE id = ${id}`);
    await tx.execute(sql`DELETE FROM notification_event_role_t WHERE event_id = ${id}`);
    if (input.role_ids.length > 0) {
      await tx.execute(sql`
        INSERT INTO notification_event_role_t (event_id, role_id)
        VALUES ${sql.join(input.role_ids.map((r) => sql`(${id}, ${r})`), sql`, `)}`);
    }
    await recordAudit(tx, {
      actorId,
      action: 'update',
      entityType: 'notification_event_master',
      entityId: id,
      before: before.rows[0],
      after: { ...input },
    });
  });
}
