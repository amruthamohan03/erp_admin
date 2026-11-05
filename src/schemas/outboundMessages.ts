import { z } from 'zod';
import { checkEmail, checkPhone } from '@/lib/validation/fields';
import { htmlToText, htmlToWhatsApp, isBlankHtml, sanitizeHtml } from '@/lib/messaging/richText';

// POST /api/v1/outbound-messages — an email or a WhatsApp message to people
// outside the system. Parsed in the browser before sending and again in the
// route, so the operator reads the same sentence either way (§4.23).

export const OUTBOUND_CHANNELS = ['email', 'whatsapp'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_STATUSES = ['queued', 'sending', 'sent', 'partial', 'failed'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

/** How a send status reads in the log and its detail view. */
export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  partial: 'Partial',
  failed: 'Failed',
};

export const MAX_RECIPIENTS = 50;
export const SUBJECT_MAX = 200;
/** WhatsApp's own ceiling for one text message, subject line included. */
export const WHATSAPP_TEXT_MAX = 4096;
const BODY_HTML_MAX = 200_000;

const FIELD_LABEL = { to: 'To', cc: 'Cc', bcc: 'Bcc' } as const;

/**
 * One recipient checked for the channel it is going out on: the normalised
 * value, or the sentence naming what is wrong with it.
 */
export function checkRecipient(
  channel: OutboundChannel,
  raw: string,
  field: keyof typeof FIELD_LABEL = 'to',
): { value?: string; error?: string } {
  const v = raw.trim();
  if (!v) return { error: `${FIELD_LABEL[field]} has an empty entry — remove it.` };
  if (channel === 'email') {
    // 254: the longest address SMTP will carry (RFC 5321).
    const r = checkEmail(v, `${FIELD_LABEL[field]} address "${v}"`, 254);
    return r.error ? { error: r.error } : { value: r.value };
  }
  const r = checkPhone(v, `${FIELD_LABEL[field]} number "${v}"`);
  if (r.error) return { error: r.error };
  // The Cloud API dials exactly what it is given, so a local number would go
  // to whichever country happens to match its leading digits.
  if (!r.value?.startsWith('+')) {
    return { error: `${FIELD_LABEL[field]} number "${v}" needs its country code for WhatsApp (e.g. +243 812 345 678).` };
  }
  return { value: r.value };
}

const recipients = z.array(z.string().max(320)).default([]);

const contentFields = {
  channel: z.enum(OUTBOUND_CHANNELS, { errorMap: () => ({ message: 'Channel must be Email or WhatsApp.' }) }),
  subject: z.string().trim().max(SUBJECT_MAX, `Subject must be ${SUBJECT_MAX} characters or fewer.`).default(''),
  message: z.string().max(BODY_HTML_MAX, 'Message is too long — shorten it or send the detail as an attachment.').default(''),
};

/**
 * Subject and body checks, shared by a single message and a bulk send so the
 * two cannot accept different messages.
 */
function checkContent(
  v: { channel: OutboundChannel; subject: string; message: string },
  ctx: z.RefinementCtx,
): void {
  if (v.channel === 'email' && !v.subject) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Subject is required for an email.' });
  }
  const html = sanitizeHtml(v.message);
  if (isBlankHtml(html)) {
    ctx.addIssue({ code: 'custom', path: ['message'], message: 'Message is required — write the text to send.' });
  } else if (v.channel === 'whatsapp') {
    const length = whatsappText(v.subject, html).length;
    if (length > WHATSAPP_TEXT_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['message'],
        message: `Message is ${length} characters — WhatsApp allows ${WHATSAPP_TEXT_MAX}. Shorten it or attach the detail as a document.`,
      });
    }
  }
}

/** The sanitised body in both forms the providers take. */
function renderContent(channel: OutboundChannel, subject: string, message: string): { body_html: string; body_text: string } {
  const html = sanitizeHtml(message);
  return { body_html: html, body_text: channel === 'email' ? htmlToText(html) : whatsappText(subject, html) };
}

export const sendOutboundSchema = z
  .object({ ...contentFields, to: recipients, cc: recipients, bcc: recipients })
  .superRefine((v, ctx) => {
    const noun = v.channel === 'email' ? 'email address' : 'WhatsApp number';
    if (v.to.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `To: add at least one ${noun}.` });
    }
    const fields = v.channel === 'email' ? (['to', 'cc', 'bcc'] as const) : (['to'] as const);
    let count = 0;
    for (const field of fields) {
      for (const raw of v[field]) {
        count += 1;
        const r = checkRecipient(v.channel, raw, field);
        if (r.error) ctx.addIssue({ code: 'custom', path: [field], message: r.error });
      }
    }
    if (count > MAX_RECIPIENTS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `${count} recipients — send to at most ${MAX_RECIPIENTS} at once, or split the list.`,
      });
    }
    checkContent(v, ctx);
  })
  .transform((v) => {
    // Normalised and de-duplicated, ignoring case: the refinement above has
    // already rejected anything that does not normalise.
    const clean = (list: string[]): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of list) {
        const value = checkRecipient(v.channel, raw).value;
        if (value && !seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
          out.push(value);
        }
      }
      return out;
    };
    const to = clean(v.to);
    // A Cc/Bcc address already in To would receive the email twice.
    const inTo = new Set(to.map((r) => r.toLowerCase()));
    const cc = v.channel === 'email' ? clean(v.cc).filter((r) => !inTo.has(r.toLowerCase())) : [];
    const bcc = v.channel === 'email' ? clean(v.bcc).filter((r) => !inTo.has(r.toLowerCase())) : [];
    return {
      channel: v.channel,
      to,
      cc,
      bcc,
      subject: v.subject,
      ...renderContent(v.channel, v.subject, v.message),
    };
  });

export type SendOutboundInput = z.input<typeof sendOutboundSchema>;
export type SendOutbound = z.output<typeof sendOutboundSchema>;

/** The message half of a bulk send — recipients come from the conditions. */
export const bulkContentSchema = z
  .object(contentFields)
  .superRefine(checkContent)
  .transform((v) => ({ channel: v.channel, subject: v.subject, ...renderContent(v.channel, v.subject, v.message) }));
export type BulkContent = z.output<typeof bulkContentSchema>;

// ---------------------------------------------------------------------------
// Bulk messages by condition: pick tracking files by their state, and write to
// the clients those files belong to — one message per client, so no client
// sees another client's address.

export const AUDIENCE_MODULES = ['import', 'export'] as const;
export type AudienceModule = (typeof AUDIENCE_MODULES)[number];
export const AUDIENCE_MODULE_LABEL: Record<AudienceModule, string> = {
  import: 'Import Tracking',
  export: 'Export Tracking',
};

/** The KPI delay outcomes worth writing to a client about. */
export const AUDIENCE_DELAYS = ['overdue', 'due_soon'] as const;
export const AUDIENCE_DELAY_LABEL: Record<(typeof AUDIENCE_DELAYS)[number], string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
};

export const PRE_ALERT_STATES = ['received', 'missing'] as const;
export const PRE_ALERT_LABEL: Record<(typeof PRE_ALERT_STATES)[number], string> = {
  received: 'Pre-alert received',
  missing: 'Pre-alert missing',
};

/** Which of a client's contacts a bulk message goes to. */
export const CONTACT_KINDS = ['main', 'secondary', 'payment'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  main: 'Main contact',
  secondary: 'Secondary contact',
  payment: 'Payments contact',
};

/** Per-client cap on one bulk send — a send runs in one request. */
export const MAX_BULK_CLIENTS = 300;

const idList = (label: string) =>
  z.array(z.coerce.number().int().positive(`${label}: pick from the list.`)).max(200, `${label}: pick at most 200.`).default([]);
/** A cleared date input or dropdown sends '' — that means "no value", not a bad one. */
const blankAsUndefined = (v: unknown): unknown => (v === '' || v === null ? undefined : v);
const isoDate = (label: string) =>
  z.preprocess(blankAsUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, `${label} must be a date (YYYY-MM-DD).`).optional());

/**
 * The conditions. Within one condition the picks are alternatives (any of these
 * clearing statuses); across conditions they all have to hold.
 */
export const audienceSchema = z
  .object({
    module: z.enum(AUDIENCE_MODULES, { errorMap: () => ({ message: 'Files: choose Import Tracking or Export Tracking.' }) }),
    client_ids: idList('Client'),
    clearing_status_ids: idList('Clearing status'),
    document_status_ids: idList('Document status'),
    cancellation_reason_ids: idList('Cancellation reason'),
    stages: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    delay: z.array(z.enum(AUDIENCE_DELAYS, { errorMap: () => ({ message: 'Delay must be Overdue or Due soon.' }) })).default([]),
    invoicing_hold: z.boolean().default(false),
    pre_alert: z.preprocess(
      blankAsUndefined,
      z.enum(PRE_ALERT_STATES, { errorMap: () => ({ message: 'Pre-alert must be received or missing.' }) }).optional(),
    ),
    pre_alert_from: isoDate('Pre-alert from'),
    pre_alert_to: isoDate('Pre-alert to'),
  })
  .superRefine((v, ctx) => {
    const preAlert = Boolean(v.pre_alert || v.pre_alert_from || v.pre_alert_to);
    if (preAlert && v.module !== 'import') {
      ctx.addIssue({ code: 'custom', path: ['pre_alert'], message: 'Pre-alert applies to Import Tracking only — export files carry no pre-alert date.' });
    }
    if (v.pre_alert === 'missing' && (v.pre_alert_from || v.pre_alert_to)) {
      ctx.addIssue({ code: 'custom', path: ['pre_alert_from'], message: 'Pre-alert dates cannot be combined with "Pre-alert missing" — a missing pre-alert has no date.' });
    }
    if (v.pre_alert_from && v.pre_alert_to && v.pre_alert_from > v.pre_alert_to) {
      ctx.addIssue({ code: 'custom', path: ['pre_alert_to'], message: 'Pre-alert to must be on or after Pre-alert from.' });
    }
    const any =
      v.client_ids.length ||
      v.clearing_status_ids.length ||
      v.document_status_ids.length ||
      v.cancellation_reason_ids.length ||
      v.stages.length ||
      v.delay.length ||
      v.invoicing_hold ||
      preAlert;
    if (!any) {
      ctx.addIssue({
        code: 'custom',
        path: ['module'],
        message: 'Choose at least one condition — a status, a reason, a pending stage, a delay or a pre-alert — so the message does not go to every client.',
      });
    }
  });
export type Audience = z.output<typeof audienceSchema>;
export type AudienceInput = z.input<typeof audienceSchema>;

export const bulkSendSchema = z.object({
  audience: audienceSchema,
  contacts: z
    .array(z.enum(CONTACT_KINDS))
    .min(1, 'Send to: choose at least one contact — main, secondary or payments.'),
  client_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'Choose at least one client to send to.')
    .max(MAX_BULK_CLIENTS, `Send to at most ${MAX_BULK_CLIENTS} clients at once — narrow the conditions or split the send.`),
});

/** A client's contact columns, as the audience query returns them. */
export interface ClientContacts {
  email: string | null;
  email_secondary: string | null;
  payment_email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  payment_phone: string | null;
}

const CONTACT_FIELD: Record<OutboundChannel, Record<ContactKind, keyof ClientContacts>> = {
  email: { main: 'email', secondary: 'email_secondary', payment: 'payment_email' },
  whatsapp: { main: 'phone', secondary: 'phone_secondary', payment: 'payment_phone' },
};

/**
 * The addresses one client's message goes to, checked for the channel with the
 * same `checkRecipient` a typed address goes through. Shared by the preview and
 * the send route, so what the screen promises is what is sent.
 */
export function contactAddresses(
  c: ClientContacts,
  channel: OutboundChannel,
  kinds: ReadonlyArray<ContactKind>,
): { valid: string[]; invalid: Array<{ value: string; error: string }> } {
  const valid: string[] = [];
  const invalid: Array<{ value: string; error: string }> = [];
  for (const kind of CONTACT_KINDS) {
    if (!kinds.includes(kind)) continue;
    const raw = c[CONTACT_FIELD[channel][kind]]?.trim();
    if (!raw) continue;
    const r = checkRecipient(channel, raw);
    if (r.error || !r.value) invalid.push({ value: raw, error: r.error ?? `"${raw}" is not usable.` });
    else if (!valid.some((x) => x.toLowerCase() === r.value!.toLowerCase())) valid.push(r.value);
  }
  return { valid, invalid };
}

/** The text WhatsApp receives: the subject in bold as a first line, then the body. */
export function whatsappText(subject: string, html: string): string {
  const body = htmlToWhatsApp(html);
  return subject.trim() ? `*${subject.trim()}*\n\n${body}` : body;
}

/** GET /api/v1/outbound-messages — the sent log. */
export const outboundListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  channel: z.enum(OUTBOUND_CHANNELS).optional(),
  status: z.enum(OUTBOUND_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type OutboundListQuery = z.infer<typeof outboundListQuerySchema>;
