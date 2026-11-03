// Stage communications — the client hears about each step from licence to
// invoice, by email and/or WhatsApp, in words configured under Masters →
// Communication Templates (§4.1).
//
// Two ways a template is used:
//
//   * Automatically. A save or a system event calls `queueStageMessages`
//     INSIDE the transaction that made the change. Matching templates are
//     rendered there (the record is visible to that transaction and to no one
//     else yet) and written to outbound_message_t as `queued`. Once the request
//     has answered — so after the commit — `drainQueuedOutbound` sends them. A
//     rolled-back change leaves nothing queued; a provider that is slow or down
//     never holds a save open; and the log shows every attempt.
//
//   * By hand. The mail / WhatsApp buttons on a stage's list ask
//     `draftStageMessage` for the composer pre-filled from the stage's manual
//     template, and the operator edits and sends it like any other message.
import { after } from 'next/server';
import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  applicationSettingsMaster,
  clientMaster,
  communicationTemplateMaster,
  importT,
  outboundMessage,
  usersT,
  type CommunicationTemplateRow,
} from '@/db/schema';
import { pageRecordDisplay } from '@/db/queries/pageExport';
import { finishOutbound, OUTBOUND_ENTITY } from '@/db/queries/outboundMessages';
import { getPageTarget } from '@/lib/pages/targets';
import { escapeHtml, renderTemplate, type TemplateContext } from '@/lib/notificationTemplate';
import { htmlToText, sanitizeHtml } from '@/lib/messaging/richText';
import { deliverOutbound } from '@/lib/messaging/deliver';
import { emailConfigured } from '@/lib/messaging/email';
import { whatsappConfigured } from '@/lib/messaging/whatsapp';
import { formatDate, todayIso } from '@/lib/formatDate';
import { checkRecipient, type OutboundChannel } from '@/schemas/outboundMessages';
import {
  COMMUNICATION_STAGES,
  splitList,
  stageLabel,
  type CommunicationRecipient,
  type CommunicationTemplateInput,
} from '@/schemas/communicationTemplates';

type Exec = Database | Transaction;

const ENTITY = 'communication_template_master';
const STAGE_SLUGS = new Set<string>(COMMUNICATION_STAGES.map((s) => s.slug));

// ---------------------------------------------------------------------------
// MASTER CRUD
// ---------------------------------------------------------------------------

export interface CommunicationTemplateItem {
  id: number;
  template_key: string;
  name: string;
  page_slug: string;
  stage: string;
  trigger: string;
  trigger_key: string;
  trigger_value: string;
  auto_email: boolean;
  auto_whatsapp: boolean;
  recipient: CommunicationRecipient;
  extra_to: string;
  cc: string;
  email_subject: string;
  email_body: string;
  whatsapp_body: string;
  display: 'Y' | 'N';
}

function toItem(r: CommunicationTemplateRow): CommunicationTemplateItem {
  return {
    id: r.id,
    template_key: r.templateKey,
    name: r.name,
    page_slug: r.pageSlug,
    stage: stageLabel(r.pageSlug),
    trigger: r.trigger,
    trigger_key: r.triggerKey ?? '',
    trigger_value: r.triggerValue ?? '',
    auto_email: r.autoEmail,
    auto_whatsapp: r.autoWhatsapp,
    recipient: r.recipient as CommunicationRecipient,
    extra_to: r.extraTo,
    cc: r.cc,
    email_subject: r.emailSubject,
    email_body: r.emailBody,
    whatsapp_body: r.whatsappBody,
    display: r.display === 'N' ? 'N' : 'Y',
  };
}

/** Every template, in stage order (licence → invoice) and then id order. */
export async function listCommunicationTemplates(): Promise<CommunicationTemplateItem[]> {
  const rows = await db.select().from(communicationTemplateMaster).orderBy(asc(communicationTemplateMaster.id));
  const order = new Map(COMMUNICATION_STAGES.map((s, i) => [s.slug as string, i]));
  return rows
    .map(toItem)
    .sort((a, b) => (order.get(a.page_slug) ?? 99) - (order.get(b.page_slug) ?? 99) || a.id - b.id);
}

/** A field-change trigger must name a real column of the stage's table. */
function assertTriggerField(input: CommunicationTemplateInput): void {
  if (input.trigger !== 'field_change') return;
  const target = getPageTarget(input.page_slug);
  if (!target?.allowedColumns.has(input.trigger_key)) {
    throw new ValidationError(
      `Field: "${input.trigger_key}" is not a field of ${stageLabel(input.page_slug)} — choose one from the list.`,
      { field: 'trigger_key' },
    );
  }
}

function columnsOf(input: CommunicationTemplateInput, actorId: number) {
  return {
    templateKey: input.template_key,
    name: input.name,
    pageSlug: input.page_slug,
    trigger: input.trigger,
    triggerKey: input.trigger_key || null,
    triggerValue: input.trigger_value || null,
    autoEmail: input.auto_email,
    autoWhatsapp: input.auto_whatsapp,
    recipient: input.recipient,
    extraTo: input.extra_to,
    cc: input.cc,
    emailSubject: input.email_subject,
    emailBody: input.email_body,
    whatsappBody: input.whatsapp_body,
    display: input.display,
    updatedBy: actorId,
  };
}

export async function createCommunicationTemplate(input: CommunicationTemplateInput, actorId: number): Promise<number> {
  assertTriggerField(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(communicationTemplateMaster)
      .values({ ...columnsOf(input, actorId), createdBy: actorId })
      .returning({ id: communicationTemplateMaster.id });
    await recordAudit(tx, { actorId, action: 'create', entityType: ENTITY, entityId: row.id, after: input });
    return row.id;
  });
}

export async function updateCommunicationTemplate(id: number, input: CommunicationTemplateInput, actorId: number): Promise<void> {
  assertTriggerField(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(communicationTemplateMaster)
      .where(eq(communicationTemplateMaster.id, id))
      .for('update');
    if (!before) throw new NotFoundError(`Communication template #${id} no longer exists — reload the list.`);
    await tx
      .update(communicationTemplateMaster)
      .set({ ...columnsOf(input, actorId), updatedAt: new Date() })
      .where(eq(communicationTemplateMaster.id, id));
    await recordAudit(tx, { actorId, action: 'update', entityType: ENTITY, entityId: id, before: toItem(before), after: input });
  });
}

/** Soft delete (§4.27) — the row stays, so a sent message still names its template. */
export async function disableCommunicationTemplate(id: number, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(communicationTemplateMaster)
      .where(eq(communicationTemplateMaster.id, id))
      .for('update');
    if (!before) throw new NotFoundError(`Communication template #${id} no longer exists — reload the list.`);
    await tx
      .update(communicationTemplateMaster)
      .set({ display: 'N', updatedBy: actorId, updatedAt: new Date() })
      .where(eq(communicationTemplateMaster.id, id));
    await recordAudit(tx, {
      actorId,
      action: 'delete',
      entityType: ENTITY,
      entityId: id,
      before: toItem(before),
      after: { ...toItem(before), display: 'N' },
    });
  });
}

// ---------------------------------------------------------------------------
// WHAT A TEMPLATE IS FILLED WITH
// ---------------------------------------------------------------------------

interface StageClient {
  id: number;
  short_name: string;
  company_name: string;
  emails: Record<'main' | 'secondary' | 'payment', string | null>;
  phones: Record<'main' | 'secondary' | 'payment', string | null>;
}

interface StageContext {
  title: string;
  tokens: TemplateContext;
  client: StageClient | null;
}

/**
 * The record's client. Every stage carries `client_id` except the fiche, which
 * belongs to an import file and reaches its client through it.
 */
async function stageClient(exec: Exec, raw: Record<string, unknown>): Promise<StageClient | null> {
  let clientId = Number(raw['client_id']) || null;
  if (!clientId && raw['import_id']) {
    const [imp] = await exec
      .select({ clientId: importT.clientId })
      .from(importT)
      .where(eq(importT.id, Number(raw['import_id'])))
      .limit(1);
    clientId = imp?.clientId ?? null;
  }
  if (!clientId) return null;
  const [c] = await exec
    .select({
      id: clientMaster.id,
      short_name: clientMaster.shortName,
      company_name: clientMaster.companyName,
      email: clientMaster.email,
      email2: clientMaster.emailSecondary,
      payEmail: clientMaster.paymentContactEmail,
      phone: clientMaster.phone,
      phone2: clientMaster.phoneSecondary,
      payPhone: clientMaster.paymentContactPhone,
    })
    .from(clientMaster)
    .where(eq(clientMaster.id, clientId))
    .limit(1);
  if (!c) return null;
  return {
    id: c.id,
    short_name: c.short_name ?? '',
    company_name: c.company_name ?? '',
    emails: { main: c.email, secondary: c.email2, payment: c.payEmail },
    phones: { main: c.phone, secondary: c.phone2, payment: c.payPhone },
  };
}

async function stageContext(exec: Exec, slug: string, id: number, actorId: number | null): Promise<StageContext | null> {
  const record = await pageRecordDisplay(exec, slug, id);
  if (!record) return null;
  // One after another, not Promise.all: inside a transaction every query shares
  // one connection, and pg refuses to have two in flight on it.
  const client = await stageClient(exec, record.raw);
  const settings = await exec.select({ name: applicationSettingsMaster.projectName }).from(applicationSettingsMaster).limit(1);
  const actor = actorId
    ? await exec.select({ name: usersT.fullName }).from(usersT).where(eq(usersT.id, actorId)).limit(1)
    : [];
  return {
    title: record.title,
    client,
    tokens: {
      ...record.values,
      client_code: client?.short_name ?? '',
      // A message to the client names the legal entity (§4.15).
      client_name: client?.company_name || client?.short_name || '',
      company: settings[0]?.name ?? '',
      today: formatDate(todayIso()),
      actor: actor[0]?.name ?? '',
      page_title: record.title,
    },
  };
}

const CONTACTS: Record<CommunicationRecipient, Array<'main' | 'secondary' | 'payment'>> = {
  client: ['main', 'secondary'],
  client_payment: ['payment'],
  client_all: ['main', 'secondary', 'payment'],
};

/**
 * Who a template goes to on one channel: the client's chosen contacts, then
 * the template's fixed addresses. Values that would be refused (a phone with no
 * country code, a malformed address) are left out and named in `skipped`, so
 * the log says why a contact did not receive it.
 */
function recipientsFor(
  t: Pick<CommunicationTemplateRow, 'recipient' | 'extraTo' | 'cc'>,
  client: StageClient | null,
  channel: OutboundChannel,
): { to: string[]; cc: string[]; skipped: string[] } {
  const raw: string[] = [];
  for (const key of CONTACTS[t.recipient as CommunicationRecipient] ?? CONTACTS.client) {
    const v = (channel === 'email' ? client?.emails[key] : client?.phones[key])?.trim();
    if (v) raw.push(v);
  }
  if (channel === 'email') raw.push(...splitList(t.extraTo));

  const seen = new Set<string>();
  const to: string[] = [];
  const skipped: string[] = [];
  for (const r of raw) {
    const checked = checkRecipient(channel, r);
    if (checked.error || !checked.value) {
      skipped.push(checked.error ?? r);
      continue;
    }
    if (seen.has(checked.value.toLowerCase())) continue;
    seen.add(checked.value.toLowerCase());
    to.push(checked.value);
  }
  const cc = channel === 'email' ? splitList(t.cc).filter((a) => !seen.has(a.toLowerCase())) : [];
  return { to, cc, skipped };
}

/** Plain text as paragraphs, for the log's HTML column and the composer. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/u)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/gu, '<br>')}</p>`)
    .join('');
}

function renderFor(
  t: Pick<CommunicationTemplateRow, 'emailSubject' | 'emailBody' | 'whatsappBody'>,
  tokens: TemplateContext,
  channel: OutboundChannel,
): { subject: string; html: string; text: string } {
  if (channel === 'email') {
    const html = sanitizeHtml(renderTemplate(t.emailBody, tokens, { escape: escapeHtml }));
    return { subject: renderTemplate(t.emailSubject, tokens).slice(0, 200), html, text: htmlToText(html) };
  }
  // The WhatsApp body is self-contained, so no subject line is prefixed to it.
  const text = renderTemplate(t.whatsappBody, tokens);
  return { subject: '', html: textToHtml(text), text };
}

// ---------------------------------------------------------------------------
// AUTOMATIC — QUEUE INSIDE THE CHANGE, SEND AFTER THE COMMIT
// ---------------------------------------------------------------------------

export type StageTrigger =
  | { on: 'create' }
  | { on: 'update'; changed: string[] }
  | { on: 'event'; eventKey: string };

export interface QueueStageInput {
  slug: string;
  entityId: number;
  actorId: number | null;
  trigger: StageTrigger;
}

function triggerCondition(trigger: StageTrigger): SQL | undefined {
  const t = communicationTemplateMaster;
  switch (trigger.on) {
    case 'create':
      return eq(t.trigger, 'create');
    case 'update':
      return trigger.changed.length > 0
        ? and(eq(t.trigger, 'field_change'), inArray(t.triggerKey, trigger.changed))
        : undefined;
    case 'event':
      return and(eq(t.trigger, 'event'), eq(t.triggerKey, trigger.eventKey));
  }
}

/** `trigger_value` is a comma list of labels; blank means any new value. */
function valueMatches(template: CommunicationTemplateRow, tokens: TemplateContext): boolean {
  if (template.trigger !== 'field_change' || !template.triggerValue?.trim()) return true;
  const now = String(tokens[template.triggerKey ?? ''] ?? '').trim().toLowerCase();
  return splitList(template.triggerValue).some((v) => v.toLowerCase() === now);
}

/**
 * Queue the automatic messages a change calls for. Call it inside the
 * transaction that made the change, after the change itself.
 *
 * Never throws for a messaging reason — a client with no email address is a
 * failed row in the log, not a reason for the licence to stay unsaved.
 * Returns how many messages were queued.
 */
export async function queueStageMessages(exec: Exec, input: QueueStageInput): Promise<number> {
  if (!STAGE_SLUGS.has(input.slug)) return 0;
  const condition = triggerCondition(input.trigger);
  if (!condition) return 0;

  // A channel that is not set up queues nothing: in a fresh install every save
  // would otherwise leave a failed row behind.
  const channels: OutboundChannel[] = [];
  if (emailConfigured()) channels.push('email');
  if (whatsappConfigured()) channels.push('whatsapp');
  if (channels.length === 0) return 0;

  const t = communicationTemplateMaster;
  const templates = await exec
    .select()
    .from(t)
    .where(
      and(
        eq(t.display, 'Y'),
        eq(t.pageSlug, input.slug),
        or(eq(t.autoEmail, true), eq(t.autoWhatsapp, true)),
        condition,
      ),
    )
    .orderBy(asc(t.id));
  if (templates.length === 0) return 0;

  const ctx = await stageContext(exec, input.slug, input.entityId, input.actorId);
  if (!ctx) return 0;

  let queued = 0;
  for (const template of templates) {
    if (!valueMatches(template, ctx.tokens)) continue;
    for (const channel of channels) {
      if (channel === 'email' ? !template.autoEmail : !template.autoWhatsapp) continue;
      const { to, cc, skipped } = recipientsFor(template, ctx.client, channel);
      const msg = renderFor(template, ctx.tokens, channel);
      const noun = channel === 'email' ? 'email address' : 'WhatsApp number (with country code)';
      const who = ctx.client ? `Client ${ctx.client.short_name}` : 'This record has no client, so it';
      const error =
        to.length > 0
          ? null
          : [`${who} has no usable ${noun} — add one under Masters → Clients, then send it from the ${ctx.title} list.`, ...skipped].join(' ');
      await exec.insert(outboundMessage).values({
        channel,
        toRecipients: to,
        ccRecipients: cc,
        subject: msg.subject,
        bodyHtml: msg.html,
        bodyText: msg.text,
        status: error ? 'failed' : 'queued',
        error,
        sentAt: error ? new Date() : null,
        entityType: input.slug,
        entityId: input.entityId,
        templateKey: template.templateKey,
        origin: 'auto',
      });
      if (!error) queued += 1;
    }
  }
  if (queued > 0) scheduleOutboundDrain();
  return queued;
}

/**
 * Send the queued messages once the current request has answered — by then
 * the transaction that queued them has committed (or rolled back, leaving
 * nothing to send). Outside a request (a script) there is no "after"; the
 * notification dispatcher drains the queue instead.
 */
export function scheduleOutboundDrain(): void {
  try {
    after(async () => {
      try {
        await drainQueuedOutbound();
      } catch (err) {
        console.error('[stage-messages] drain failed', err);
      }
    });
  } catch {
    // Not inside a request — scripts/dispatch-notifications.ts picks these up.
  }
}

const DRAIN_BATCH = 20;

/**
 * Send every queued message. Rows are claimed with SKIP LOCKED, so two drains
 * running at once (two saves finishing together, or the dispatcher) never send
 * the same message twice. Returns how many were attempted.
 */
export async function drainQueuedOutbound(): Promise<number> {
  const m = outboundMessage;
  let attempted = 0;
  for (;;) {
    const claimed = await db
      .update(m)
      .set({ status: 'sending' })
      .where(
        inArray(
          m.id,
          db.select({ id: m.id }).from(m).where(eq(m.status, 'queued')).orderBy(asc(m.id)).limit(DRAIN_BATCH).for('update', { skipLocked: true }),
        ),
      )
      .returning();
    for (const row of claimed) {
      const results = await deliverOutbound({
        channel: row.channel as OutboundChannel,
        to: row.toRecipients,
        cc: row.ccRecipients,
        bcc: row.bccRecipients,
        subject: row.subject,
        html: row.bodyHtml,
        text: row.bodyText,
        files: [],
      });
      await db.transaction(async (tx) => {
        const outcome = await finishOutbound(tx, row.id, results);
        await recordAudit(tx, {
          actorId: null,
          action: 'create',
          entityType: OUTBOUND_ENTITY,
          entityId: row.id,
          module: 'communications',
          after: {
            channel: row.channel,
            to: row.toRecipients,
            cc: row.ccRecipients,
            subject: row.subject,
            status: outcome.status,
            record: `${row.entityType}#${row.entityId}`,
            template: row.templateKey,
          },
          metadata: { results, origin: 'auto' },
        });
      });
      attempted += 1;
    }
    if (claimed.length < DRAIN_BATCH) return attempted;
  }
}

// ---------------------------------------------------------------------------
// BY HAND — THE ROW ACTIONS' DRAFT
// ---------------------------------------------------------------------------

export interface StageDraft {
  channel: OutboundChannel;
  to: string[];
  cc: string[];
  subject: string;
  /** HTML for the composer's editor. */
  message: string;
  template_key: string | null;
  /** What the record is, for the dialog title — "Import Tracking NMI-IDCOR26-0001". */
  record_label: string;
  /** Contacts on the client that could not be used, and why. */
  notes: string[];
}

/** The fields a stage's reference lives in, first one present wins. */
const REFERENCE_TOKENS = ['mca_ref', 'license_number', 'quotation_ref', 'fiche_reference', 'mca_lt_reference', 'invoice_ref'];

export async function draftStageMessage(slug: string, id: number, channel: OutboundChannel, actorId: number): Promise<StageDraft> {
  const ctx = await stageContext(db, slug, id, actorId);
  if (!ctx) throw new NotFoundError(`${stageLabel(slug)} #${id} was not found. It may have been deleted — reload the list.`);

  const t = communicationTemplateMaster;
  // The stage's manual template; failing that, any template of the stage, so a
  // stage someone configured only automatic wording for still drafts in it.
  const [template] = await db
    .select()
    .from(t)
    .where(and(eq(t.display, 'Y'), eq(t.pageSlug, slug)))
    .orderBy(sql`CASE WHEN ${t.trigger} = 'manual' THEN 0 ELSE 1 END`, asc(t.id))
    .limit(1);

  const reference = REFERENCE_TOKENS.map((k) => String(ctx.tokens[k] ?? '')).find(Boolean) ?? `#${id}`;
  const fallback = {
    recipient: 'client',
    extraTo: '',
    cc: '',
    emailSubject: `${ctx.title} ${reference}`,
    emailBody: '<p>Dear {client_name},</p><p></p><p>Kind regards,<br>{company}</p>',
    whatsappBody: 'Dear {client_code}, ',
  };
  const source = template ?? fallback;
  const { to, cc, skipped } = recipientsFor(source, ctx.client, channel);
  const msg = renderFor(source, ctx.tokens, channel);

  const notes = [...skipped];
  if (!ctx.client) notes.push('This record has no client — type the recipients yourself.');
  else if (to.length === 0) {
    notes.push(
      channel === 'email'
        ? `Client ${ctx.client.short_name} has no email address on record — type one, or add it under Masters → Clients.`
        : `Client ${ctx.client.short_name} has no WhatsApp number with a country code on record — type one, or add it under Masters → Clients.`,
    );
  }

  return {
    channel,
    to,
    cc,
    subject: msg.subject,
    message: channel === 'email' ? msg.html : textToHtml(msg.text),
    template_key: template?.templateKey ?? null,
    record_label: `${ctx.title} ${reference}`,
    notes,
  };
}
