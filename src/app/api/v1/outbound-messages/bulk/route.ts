// POST /api/v1/outbound-messages/bulk (multipart) — one email or WhatsApp
// message to every chosen client whose tracking files meet the conditions.
//
// Fields: channel, subject, message (HTML), audience (JSON, `audienceSchema`),
// contacts (JSON, which of a client's contacts), client_ids (JSON, the clients
// the operator kept ticked in the preview), and any number of `attachments`.
//
// Each client gets its OWN message, so no client sees another's address. The
// conditions are resolved again here rather than trusting the preview: a client
// ticked a minute ago whose files have since moved on is skipped and named.
//
// As with a single message, every row (and the attachments, stored once on the
// batch's first row) is committed before any provider is called, and each
// outcome is written after its own send.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { AppError, ValidationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { outboundMessage } from '@/db/schema';
import { storeFile } from '@/db/queries/files';
import { finishOutbound, OUTBOUND_ENTITY } from '@/db/queries/outboundMessages';
import { resolveAudience } from '@/db/queries/outboundAudience';
import { AUDIENCE_MODULE_LABEL, bulkContentSchema, bulkSendSchema, contactAddresses } from '@/schemas';
import { deliverOutbound } from '@/lib/messaging/deliver';
import { assertChannelConfigured, jsonField, readAttachments } from '@/lib/messaging/outboundForm';

const MENU = '/communications';

interface Skipped {
  client: string;
  reason: string;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;

  const form = await req.formData();
  const content = bulkContentSchema.parse({
    channel: form.get('channel'),
    subject: form.get('subject') ?? '',
    message: form.get('message') ?? '',
  });
  const bulk = bulkSendSchema.parse({
    audience: jsonField(form, 'audience', 'The conditions', {}),
    contacts: jsonField(form, 'contacts', 'Send to'),
    client_ids: jsonField(form, 'client_ids', 'The chosen clients'),
  });
  const outgoing = await readAttachments(form);
  assertChannelConfigured(content.channel);

  const noun = content.channel === 'email' ? 'email address' : 'WhatsApp number';
  const matched = new Map((await resolveAudience(session, bulk.audience)).map((c) => [c.client_id, c]));

  const skipped: Skipped[] = [];
  const plans: Array<{ clientId: number; client: string; to: string[] }> = [];
  for (const id of new Set(bulk.client_ids)) {
    const c = matched.get(id);
    if (!c) {
      skipped.push({ client: `Client #${id}`, reason: 'its files no longer meet the conditions' });
      continue;
    }
    const { valid, invalid } = contactAddresses(c, content.channel, bulk.contacts);
    if (valid.length === 0) {
      skipped.push({ client: c.short_name, reason: invalid[0]?.error ?? `no ${noun} on file for the chosen contacts` });
      continue;
    }
    plans.push({ clientId: c.client_id, client: c.short_name, to: valid });
  }

  if (plans.length === 0) {
    const first = skipped.slice(0, 3).map((s) => `${s.client}: ${s.reason}`).join('; ');
    throw new ValidationError(
      `Nothing was sent — none of the ${skipped.length} chosen client${skipped.length === 1 ? '' : 's'} has a usable ${noun}. ${first}.`,
      { skipped },
    );
  }

  const ids = await db.transaction(async (tx) => {
    const out: number[] = [];
    for (const plan of plans) {
      const [row] = await tx
        .insert(outboundMessage)
        .values({
          channel: content.channel,
          toRecipients: plan.to,
          subject: content.subject,
          bodyHtml: content.body_html,
          bodyText: content.body_text,
          attachmentCount: outgoing.length,
          sentBy: session.uid,
          bulkParentId: out[0] ?? null,
        })
        .returning({ id: outboundMessage.id });
      out.push(row.id);
    }
    for (const f of outgoing) {
      await storeFile(tx, {
        bytes: f.data,
        name: f.name,
        mime: f.mime,
        uploaderId: session.uid,
        entityType: OUTBOUND_ENTITY,
        entityId: String(out[0]),
      });
    }
    return out;
  });
  const batchId = ids[0];

  // One client at a time: a provider rate limit is easier to stay under than to
  // recover from, and each outcome is recorded the moment it is known.
  const tally = { sent: 0, partial: 0, failed: 0 };
  const failures: Skipped[] = [];
  for (const [i, plan] of plans.entries()) {
    const id = ids[i];
    const results = await deliverOutbound({
      channel: content.channel,
      to: plan.to,
      cc: [],
      bcc: [],
      subject: content.subject,
      html: content.body_html,
      text: content.body_text,
      files: outgoing,
    });
    const o = await db.transaction(async (tx) => {
      const done = await finishOutbound(tx, id, results);
      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: OUTBOUND_ENTITY,
        entityId: id,
        module: 'communications',
        after: {
          channel: content.channel,
          to: plan.to,
          subject: content.subject,
          attachments: outgoing.map((f) => f.name),
          status: done.status,
        },
        metadata: {
          results,
          bulk: { batch_id: batchId, client: plan.client, client_id: plan.clientId, files: AUDIENCE_MODULE_LABEL[bulk.audience.module], conditions: bulk.audience, contacts: bulk.contacts },
        },
      });
      return done;
    });
    tally[o.status === 'sent' ? 'sent' : o.status === 'partial' ? 'partial' : 'failed'] += 1;
    if (o.status !== 'sent') failures.push({ client: plan.client, reason: o.error ?? 'the provider refused the message' });
  }

  // Nothing reached anyone: a failure to show, not a 201 (§4.22). Every attempt
  // is already on the log.
  if (tally.sent === 0 && tally.partial === 0) {
    throw new AppError(
      `Not sent — all ${plans.length} message${plans.length === 1 ? '' : 's'} failed. ${failures[0]?.reason ?? ''}`.trim(),
      502,
      'INTERNAL_ERROR',
      { batch_id: batchId, failures, skipped },
    );
  }
  return ok({ batch_id: batchId, messages: plans.length, ...tally, failures, skipped }, 201);
});
