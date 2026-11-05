// GET  /api/v1/outbound-messages?q=&channel=&status=&page=&pageSize= — the sent log.
// POST /api/v1/outbound-messages (multipart) — send an email or a WhatsApp message.
//
// POST fields: channel, to / cc / bcc (JSON arrays of addresses or numbers),
// subject, message (the body as HTML), and any number of `attachments` files.
// Sent from a stage list's mail / WhatsApp button it also carries entity_type,
// entity_id and template_key, so the record's messages can be traced.
//
// The message row and its attachments are committed BEFORE the provider is
// called, and the outcome is written after — so the log holds every attempt,
// including one interrupted mid-send, and no provider call happens inside an
// open transaction. Gated on the /communications menu (view to read, add to send).
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { outboundMessage } from '@/db/schema';
import { storeFile } from '@/db/queries/files';
import { finishOutbound, listOutbound, OUTBOUND_ENTITY } from '@/db/queries/outboundMessages';
import { outboundLinkSchema, outboundListQuerySchema, sendOutboundSchema } from '@/schemas';
import { emailConfigured } from '@/lib/messaging/email';
import { whatsappConfigured } from '@/lib/messaging/whatsapp';
import { deliverOutbound } from '@/lib/messaging/deliver';
import { assertChannelConfigured, jsonField, readAttachments } from '@/lib/messaging/outboundForm';

const MENU = '/communications';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'view');
  if (isResponse(session)) return session;
  const { searchParams } = new URL(req.url);
  const q = outboundListQuerySchema.parse(Object.fromEntries(searchParams));
  const { items, total } = await listOutbound(q);
  return ok(items, {
    meta: {
      total,
      page: q.page,
      pageSize: q.pageSize,
      // So the composer can say a channel is not set up before anyone writes a message.
      email_configured: emailConfigured(),
      whatsapp_configured: whatsappConfigured(),
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;

  const form = await req.formData();
  const input = sendOutboundSchema.parse({
    channel: form.get('channel'),
    to: jsonField(form, 'to', 'To'),
    cc: jsonField(form, 'cc', 'Cc'),
    bcc: jsonField(form, 'bcc', 'Bcc'),
    subject: form.get('subject') ?? '',
    message: form.get('message') ?? '',
  });
  const optional = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === 'string' && v.trim() !== '' ? v : undefined;
  };
  const link = outboundLinkSchema.parse({
    entity_type: optional('entity_type'),
    entity_id: optional('entity_id'),
    template_key: optional('template_key'),
  });

  const outgoing = await readAttachments(form);
  assertChannelConfigured(input.channel);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(outboundMessage)
      .values({
        channel: input.channel,
        toRecipients: input.to,
        ccRecipients: input.cc,
        bccRecipients: input.bcc,
        subject: input.subject,
        bodyHtml: input.body_html,
        bodyText: input.body_text,
        attachmentCount: outgoing.length,
        sentBy: session.uid,
        entityType: link.entity_type ?? null,
        entityId: link.entity_id ?? null,
        templateKey: link.template_key ?? null,
      })
      .returning({ id: outboundMessage.id });
    for (const f of outgoing) {
      await storeFile(tx, {
        bytes: f.data,
        name: f.name,
        mime: f.mime,
        uploaderId: session.uid,
        entityType: OUTBOUND_ENTITY,
        entityId: String(row.id),
      });
    }
    return row.id;
  });

  const results = await deliverOutbound({
    channel: input.channel,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    html: input.body_html,
    text: input.body_text,
    files: outgoing,
  });

  const outcome = await db.transaction(async (tx) => {
    const o = await finishOutbound(tx, id, results);
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: OUTBOUND_ENTITY,
      entityId: id,
      module: 'communications',
      after: {
        channel: input.channel,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        attachments: outgoing.map((f) => f.name),
        status: o.status,
      },
      metadata: { results, ...(link.entity_type ? { record: `${link.entity_type}#${link.entity_id}` } : {}) },
    });
    return o;
  });

  // Nothing went out: a failure the operator must see, not a 201 with a
  // status buried in it (§4.22). The attempt is already on the log.
  if (outcome.status === 'failed') {
    throw new AppError(`Not sent — ${outcome.error ?? 'the provider refused the message.'}`, 502, 'INTERNAL_ERROR', {
      id,
      results,
    });
  }
  return ok({ id, status: outcome.status, error: outcome.error, results }, 201);
});
