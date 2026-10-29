import { z } from 'zod';
import { checkEmail, checkPhone } from '@/lib/validation/fields';
import { htmlToText, htmlToWhatsApp, isBlankHtml, sanitizeHtml } from '@/lib/messaging/richText';

// POST /api/v1/outbound-messages — an email or a WhatsApp message to people
// outside the system. Parsed in the browser before sending and again in the
// route, so the operator reads the same sentence either way (§4.23).

export const OUTBOUND_CHANNELS = ['email', 'whatsapp'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_STATUSES = ['sending', 'sent', 'partial', 'failed'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

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

export const sendOutboundSchema = z
  .object({
    channel: z.enum(OUTBOUND_CHANNELS, { errorMap: () => ({ message: 'Channel must be Email or WhatsApp.' }) }),
    to: recipients,
    cc: recipients,
    bcc: recipients,
    subject: z.string().trim().max(SUBJECT_MAX, `Subject must be ${SUBJECT_MAX} characters or fewer.`).default(''),
    message: z.string().max(BODY_HTML_MAX, 'Message is too long — shorten it or send the detail as an attachment.').default(''),
  })
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
    const html = sanitizeHtml(v.message);
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
      body_html: html,
      body_text: v.channel === 'email' ? htmlToText(html) : whatsappText(v.subject, html),
    };
  });

export type SendOutboundInput = z.input<typeof sendOutboundSchema>;
export type SendOutbound = z.output<typeof sendOutboundSchema>;

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
