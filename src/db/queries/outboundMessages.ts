import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { clientMaster, filesT, outboundMessage, usersT, type OutboundResult } from '@/db/schema';
import type { OutboundChannel, OutboundListQuery, OutboundStatus } from '@/schemas/outboundMessages';

// Communication → Email & WhatsApp: the sent log and the address book the
// composer suggests from. Sending itself is in the route; this module only
// reads and records.

export const OUTBOUND_ENTITY = 'outbound_message';

/** Sent, failed, or both — judged from what each recipient's provider said. */
export function outcomeOf(results: ReadonlyArray<OutboundResult>): OutboundStatus {
  const sent = results.filter((r) => r.status === 'sent').length;
  if (sent === 0) return 'failed';
  return sent === results.length ? 'sent' : 'partial';
}

export async function finishOutbound(
  tx: Database | Transaction,
  id: number,
  results: OutboundResult[],
): Promise<{ status: OutboundStatus; error: string | null }> {
  const status = outcomeOf(results);
  // One sentence per distinct reason, so fifty numbers failing for the same
  // cause read as one line rather than fifty.
  const reasons = [...new Set(results.filter((r) => r.error).map((r) => r.error as string))];
  const error = reasons.length ? reasons.join(' ') : null;
  await tx
    .update(outboundMessage)
    .set({ status, results, error, sentAt: new Date() })
    .where(eq(outboundMessage.id, id));
  return { status, error };
}

export interface OutboundListItem {
  id: number;
  channel: OutboundChannel;
  to_recipients: string[];
  cc_recipients: string[];
  subject: string;
  body_text: string;
  status: OutboundStatus;
  error: string | null;
  attachment_count: number;
  sent_by_name: string | null;
  created_at: string;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export async function listOutbound(q: OutboundListQuery): Promise<{ items: OutboundListItem[]; total: number }> {
  const conds: SQL[] = [eq(outboundMessage.display, 'Y')];
  if (q.channel) conds.push(eq(outboundMessage.channel, q.channel));
  if (q.status) conds.push(eq(outboundMessage.status, q.status));
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(
      or(
        ilike(outboundMessage.subject, like),
        ilike(outboundMessage.bodyText, like),
        sql`${outboundMessage.toRecipients}::text ILIKE ${like}`,
        sql`${outboundMessage.ccRecipients}::text ILIKE ${like}`,
        ilike(usersT.fullName, like),
        // What the date column shows (§4.19) — DD-MM-YYYY is typeable too.
        sql`to_char(${outboundMessage.createdAt}, 'DD-MM-YYYY') ILIKE ${like}`,
      ) as SQL,
    );
  }
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: count() })
    .from(outboundMessage)
    .leftJoin(usersT, eq(usersT.id, outboundMessage.sentBy))
    .where(where);

  const rows = await db
    .select({
      id: outboundMessage.id,
      channel: outboundMessage.channel,
      to_recipients: outboundMessage.toRecipients,
      cc_recipients: outboundMessage.ccRecipients,
      subject: outboundMessage.subject,
      body_text: outboundMessage.bodyText,
      status: outboundMessage.status,
      error: outboundMessage.error,
      attachment_count: outboundMessage.attachmentCount,
      sent_by_name: usersT.fullName,
      created_at: outboundMessage.createdAt,
    })
    .from(outboundMessage)
    .leftJoin(usersT, eq(usersT.id, outboundMessage.sentBy))
    .where(where)
    .orderBy(desc(outboundMessage.createdAt), desc(outboundMessage.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return {
    total: Number(total),
    items: rows.map((r) => ({
      ...r,
      channel: r.channel as OutboundChannel,
      status: r.status as OutboundStatus,
      created_at: iso(r.created_at),
    })),
  };
}

export interface OutboundDetail extends OutboundListItem {
  bcc_recipients: string[];
  body_html: string;
  results: OutboundResult[];
  sent_at: string | null;
  attachments: Array<{ id: number; name: string; size: number | null; mime: string | null }>;
}

export async function getOutbound(id: number): Promise<OutboundDetail | null> {
  const [row] = await db
    .select({
      id: outboundMessage.id,
      channel: outboundMessage.channel,
      to_recipients: outboundMessage.toRecipients,
      cc_recipients: outboundMessage.ccRecipients,
      bcc_recipients: outboundMessage.bccRecipients,
      subject: outboundMessage.subject,
      body_text: outboundMessage.bodyText,
      body_html: outboundMessage.bodyHtml,
      status: outboundMessage.status,
      error: outboundMessage.error,
      results: outboundMessage.results,
      attachment_count: outboundMessage.attachmentCount,
      sent_by_name: usersT.fullName,
      created_at: outboundMessage.createdAt,
      sent_at: outboundMessage.sentAt,
    })
    .from(outboundMessage)
    .leftJoin(usersT, eq(usersT.id, outboundMessage.sentBy))
    .where(and(eq(outboundMessage.id, id), eq(outboundMessage.display, 'Y')))
    .limit(1);
  if (!row) return null;

  const attachments = await db
    .select({ id: filesT.id, name: filesT.originalName, size: filesT.size, mime: filesT.mime })
    .from(filesT)
    .where(and(eq(filesT.entityType, OUTBOUND_ENTITY), eq(filesT.entityId, String(id))))
    .orderBy(asc(filesT.id));

  return {
    ...row,
    channel: row.channel as OutboundChannel,
    status: row.status as OutboundStatus,
    created_at: iso(row.created_at),
    sent_at: row.sent_at ? iso(row.sent_at) : null,
    attachments: attachments.map((a) => ({ ...a, name: a.name ?? `File #${a.id}` })),
  };
}

export interface DirectoryEntry {
  value: string;
  /** Who it belongs to — the client code (§4.15) or the user's name. */
  label: string;
  source: 'client' | 'user';
}

/**
 * Every email address and phone number on an active client or user, for the
 * composer's suggestions. A client carries up to three of each; each is its
 * own entry so the operator picks the one they mean.
 */
export async function recipientDirectory(): Promise<{ emails: DirectoryEntry[]; phones: DirectoryEntry[] }> {
  const [clients, users] = await Promise.all([
    db
      .select({
        short_name: clientMaster.shortName,
        email: clientMaster.email,
        email2: clientMaster.emailSecondary,
        payEmail: clientMaster.paymentContactEmail,
        phone: clientMaster.phone,
        phone2: clientMaster.phoneSecondary,
        payPhone: clientMaster.paymentContactPhone,
      })
      .from(clientMaster)
      .where(eq(clientMaster.display, 'Y'))
      .orderBy(asc(clientMaster.id)),
    db
      .select({ name: usersT.fullName, username: usersT.username, email: usersT.email, mobile: usersT.mobile })
      .from(usersT)
      .where(eq(usersT.display, 'Y'))
      .orderBy(asc(usersT.id)),
  ]);

  const emails: DirectoryEntry[] = [];
  const phones: DirectoryEntry[] = [];
  const add = (list: DirectoryEntry[], value: string | null, label: string, source: DirectoryEntry['source']): void => {
    const v = value?.trim();
    if (v && !list.some((e) => e.value.toLowerCase() === v.toLowerCase())) list.push({ value: v, label, source });
  };
  for (const c of clients) {
    add(emails, c.email, c.short_name, 'client');
    add(emails, c.email2, c.short_name, 'client');
    add(emails, c.payEmail, `${c.short_name} · payments`, 'client');
    add(phones, c.phone, c.short_name, 'client');
    add(phones, c.phone2, c.short_name, 'client');
    add(phones, c.payPhone, `${c.short_name} · payments`, 'client');
  }
  for (const u of users) {
    const label = u.name || u.username;
    add(emails, u.email, label, 'user');
    add(phones, u.mobile, label, 'user');
  }
  return { emails, phones };
}
