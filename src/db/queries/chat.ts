// Communication → Live Chat: one-to-one messages between signed-in users.
//
// Who can be messaged is read from the same place the route's permission check
// reads (§4.7): an active user whose role may VIEW `/chat`. A contact the list
// offers is therefore always someone who can open the reply — the screen never
// lets you write to a person who will never see it.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { ValidationError } from '@/lib/errors';

type Rows<T> = { rows: T[] };

/** The menu URL that IS the chat resource. */
export const CHAT_RESOURCE = '/chat';

export interface ChatContact {
  user_id: number;
  full_name: string;
  role_name: string | null;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean;
  unread: number;
  /** Their app polled within `ONLINE_WINDOW_SECONDS`. */
  online: boolean;
}

/**
 * How recently a user must have checked in to count as online. The chat
 * button polls every 15 s and the contact list every 10 s, both only while the
 * tab is visible — so a minute tolerates a few slow or missed polls, and a
 * closed or hidden app drops to offline within a minute.
 */
export const ONLINE_WINDOW_SECONDS = 60;

/**
 * Record that `me`'s app is open. Called from the chat polls, so presence costs
 * no request of its own.
 */
export async function touchChatPresence(me: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO chat_presence_t (user_id, last_seen_at) VALUES (${me}, now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`);
}

export interface ChatMessage {
  id: number;
  sender_user_id: number;
  recipient_user_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Active users, other than `me`, whose role may view the chat. */
const chatUsers = (me: number) => sql`
  SELECT u.id, u.full_name, r.role_name
    FROM users_t u
    LEFT JOIN role_master_t r ON r.id = u.role_id
   WHERE u.display = 'Y'
     AND u.id <> ${me}
     AND EXISTS (
       SELECT 1
         FROM role_menu_mapping_t rm
         JOIN menu_master_t m ON m.id = rm.menu_id
        WHERE rm.role_id = u.role_id
          AND rm.can_view = true
          AND m.url = ${CHAT_RESOURCE}
          AND m.display = 'Y'
     )`;

/**
 * Everyone `me` can chat with, the most recent conversation first, then the
 * people never written to in name order — the list a person scans to pick up
 * where they left off.
 */
export async function listChatContacts(me: number): Promise<ChatContact[]> {
  const res = (await db.execute(sql`
    WITH people AS (${chatUsers(me)}),
    last AS (
      SELECT DISTINCT ON (other)
             other, body, created_at, sender_user_id = ${me} AS from_me
        FROM (
          SELECT c.*, CASE WHEN c.sender_user_id = ${me} THEN c.recipient_user_id ELSE c.sender_user_id END AS other
            FROM chat_message_t c
           WHERE c.sender_user_id = ${me} OR c.recipient_user_id = ${me}
        ) x
       ORDER BY other, id DESC
    ),
    unread AS (
      SELECT sender_user_id AS other, count(*)::int AS n
        FROM chat_message_t
       WHERE recipient_user_id = ${me} AND read_at IS NULL
       GROUP BY sender_user_id
    )
    SELECT p.id AS user_id, p.full_name, p.role_name,
           l.body AS last_body, l.created_at AS last_at, COALESCE(l.from_me, false) AS last_from_me,
           COALESCE(n.n, 0) AS unread,
           COALESCE(pr.last_seen_at > now() - make_interval(secs => ${ONLINE_WINDOW_SECONDS}), false) AS online
      FROM people p
      LEFT JOIN last l ON l.other = p.id
      LEFT JOIN unread n ON n.other = p.id
      LEFT JOIN chat_presence_t pr ON pr.user_id = p.id
     ORDER BY l.created_at DESC NULLS LAST, p.full_name ASC`)) as unknown as Rows<ChatContact>;
  return res.rows.map((r) => ({ ...r, last_at: r.last_at ? new Date(r.last_at).toISOString() : null }));
}

/** How many messages are waiting for `me`, across every conversation. */
export async function chatUnreadCount(me: number): Promise<number> {
  const res = (await db.execute(sql`
    SELECT count(*)::int AS n FROM chat_message_t
     WHERE recipient_user_id = ${me} AND read_at IS NULL`)) as unknown as Rows<{ n: number }>;
  return res.rows[0]?.n ?? 0;
}

/** The newest messages a thread opens with; older history is not paged in yet. */
const THREAD_LIMIT = 200;

/**
 * The conversation between `me` and `other`, oldest first. Opening it is
 * reading it, so the messages `other` sent are marked read in the same call —
 * the badge and the thread can never disagree about what has been seen.
 */
export async function chatThread(me: number, other: number, afterId?: number): Promise<ChatMessage[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE chat_message_t SET read_at = now()
       WHERE recipient_user_id = ${me} AND sender_user_id = ${other} AND read_at IS NULL`);
    const res = (await tx.execute(sql`
      SELECT * FROM (
        SELECT id, sender_user_id, recipient_user_id, body, created_at, read_at
          FROM chat_message_t
         WHERE ((sender_user_id = ${me} AND recipient_user_id = ${other})
             OR (sender_user_id = ${other} AND recipient_user_id = ${me}))
           ${afterId ? sql`AND id > ${afterId}` : sql``}
         ORDER BY id DESC
         LIMIT ${THREAD_LIMIT}
      ) t ORDER BY id ASC`)) as unknown as Rows<ChatMessage>;
    return res.rows.map((r) => ({
      ...r,
      created_at: new Date(r.created_at).toISOString(),
      read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
    }));
  });
}

/**
 * Send one message. The recipient must be someone the contact list would offer
 * — checked here rather than trusted from the screen, so a stale tab or a
 * direct POST cannot write to a user who has since lost access.
 */
export async function sendChatMessage(me: number, to: number, body: string): Promise<ChatMessage> {
  return db.transaction(async (tx) => {
    if (to === me) {
      throw new ValidationError('To: you cannot send a chat message to yourself.', { field: 'to' });
    }
    const allowed = (await tx.execute(sql`
      SELECT p.full_name FROM (${chatUsers(me)}) p WHERE p.id = ${to}`)) as unknown as Rows<{ full_name: string }>;
    if (!allowed.rows[0]) {
      throw new ValidationError(
        'To: this person is no longer available for chat — their account is disabled or their role no longer has Live Chat. Reload the list and choose again.',
        { field: 'to' },
      );
    }
    const res = (await tx.execute(sql`
      INSERT INTO chat_message_t (sender_user_id, recipient_user_id, body)
      VALUES (${me}, ${to}, ${body})
      RETURNING id, sender_user_id, recipient_user_id, body, created_at, read_at`)) as unknown as Rows<ChatMessage>;
    const row = res.rows[0]!;
    // §4.28 — who wrote to whom, and when. The text itself stays in the chat
    // table; copying every message into the audit trail would double it.
    await recordAudit(tx, {
      actorId: me,
      action: 'create',
      entityType: 'chat_message',
      entityId: row.id,
      after: { recipient_user_id: to, length: body.length },
    });
    return { ...row, created_at: new Date(row.created_at).toISOString(), read_at: null };
  });
}
