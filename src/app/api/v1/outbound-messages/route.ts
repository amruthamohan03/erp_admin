// GET  /api/v1/outbound-messages?q=&channel=&status=&page=&pageSize= — the sent log.
// POST /api/v1/outbound-messages (multipart) — send an email or a WhatsApp message.
//
// POST fields: channel, to / cc / bcc (JSON arrays of addresses or numbers),
// subject, message (the body as HTML), and any number of `attachments` files.
//
// The message row and its attachments are committed BEFORE the provider is
// called, and the outcome is written after — so the log holds every attempt,
// including one interrupted mid-send, and no provider call happens inside an
// open transaction. Gated on the /communications menu (view to read, add to send).
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { AppError, BadRequestError, ValidationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { outboundMessage } from '@/db/schema';
import { storeFile } from '@/db/queries/files';
import { finishOutbound, listOutbound, OUTBOUND_ENTITY } from '@/db/queries/outboundMessages';
import { outboundListQuerySchema, sendOutboundSchema } from '@/schemas';
import { attachmentError } from '@/lib/messaging/attachments';
import { emailConfigured, sendEmail, type OutgoingFile } from '@/lib/messaging/email';
import { sendWhatsApp, whatsappConfigured } from '@/lib/messaging/whatsapp';
import { CHANNEL_NOT_CONFIGURED } from '@/lib/messaging/setup';

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

/** A recipient list field: a JSON array of strings, or absent. */
function listField(form: FormData, key: 'to' | 'cc' | 'bcc'): unknown {
  const raw = form.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError(`${key.toUpperCase()} must be a JSON list of recipients, e.g. ["name@company.com"].`);
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;

  const form = await req.formData();
  const input = sendOutboundSchema.parse({
    channel: form.get('channel'),
    to: listField(form, 'to'),
    cc: listField(form, 'cc'),
    bcc: listField(form, 'bcc'),
    subject: form.get('subject') ?? '',
    message: form.get('message') ?? '',
  });

  const files = form.getAll('attachments').filter((f): f is File => f instanceof File);
  const tooMuch = attachmentError(files);
  if (tooMuch) throw new ValidationError(tooMuch, { fields: { attachments: tooMuch } });

  const configured = input.channel === 'email' ? emailConfigured() : whatsappConfigured();
  if (!configured) throw new AppError(CHANNEL_NOT_CONFIGURED[input.channel], 503, 'INTERNAL_ERROR');

  const outgoing: OutgoingFile[] = await Promise.all(
    files.map(async (f) => ({ name: f.name, mime: f.type || null, data: Buffer.from(await f.arrayBuffer()) })),
  );

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

  const results =
    input.channel === 'email'
      ? await sendEmail({
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          html: input.body_html,
          text: input.body_text,
          files: outgoing,
        })
      : await sendWhatsApp({ to: input.to, text: input.body_text, files: outgoing });

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
      metadata: { results },
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
