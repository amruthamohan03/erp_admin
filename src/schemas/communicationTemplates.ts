import { z } from 'zod';
import { checkRecipient, OUTBOUND_CHANNELS, WHATSAPP_TEXT_MAX } from './outboundMessages';
import { isBlankHtml, sanitizeHtml } from '@/lib/messaging/richText';

// Masters → Communication Templates, and the row actions' draft request.
// Parsed in the browser before saving and again in the route (§4.23).

export const COMMUNICATION_TRIGGERS = ['create', 'field_change', 'event', 'manual'] as const;
export type CommunicationTrigger = (typeof COMMUNICATION_TRIGGERS)[number];

export const COMMUNICATION_RECIPIENTS = ['client', 'client_payment', 'client_all'] as const;
export type CommunicationRecipient = (typeof COMMUNICATION_RECIPIENTS)[number];

/**
 * The stages a template can belong to — licence to invoice. A closed set
 * because something has to know where each record's client is (§4.33's
 * reasoning): every one of these pages has a `client_id`, except the fiche,
 * which reaches its client through its import file.
 */
export const COMMUNICATION_STAGES = [
  { slug: 'license', label: 'Import Licence' },
  { slug: 'export-license', label: 'Export Licence' },
  { slug: 'quotation', label: 'Quotation' },
  { slug: 'fiche', label: 'Fiche de Calcul' },
  { slug: 'import', label: 'Import Tracking' },
  { slug: 'export', label: 'Export Tracking' },
  { slug: 'local', label: 'Local Tracking' },
  { slug: 'export-invoices', label: 'Export Invoice' },
  { slug: 'import-invoices', label: 'Import Invoice' },
] as const;
export type CommunicationStage = (typeof COMMUNICATION_STAGES)[number]['slug'];
const STAGE_SLUGS = COMMUNICATION_STAGES.map((s) => s.slug) as [CommunicationStage, ...CommunicationStage[]];

export function stageLabel(slug: string): string {
  return COMMUNICATION_STAGES.find((s) => s.slug === slug)?.label ?? slug;
}

export const TRIGGER_LABEL: Record<(typeof COMMUNICATION_TRIGGERS)[number], string> = {
  create: 'Record created',
  field_change: 'Field changes',
  event: 'System event',
  manual: 'Manual only',
};

export const RECIPIENT_LABEL: Record<(typeof COMMUNICATION_RECIPIENTS)[number], string> = {
  client: 'Client — main contacts',
  client_payment: 'Client — payment contact',
  client_all: 'Client — every contact',
};

/** A comma-separated list of addresses, each checked and normalised. */
function emailList(label: string) {
  return z
    .string()
    .max(2000, `${label} is too long — list at most a few addresses.`)
    .default('')
    .superRefine((v, ctx) => {
      for (const raw of splitList(v)) {
        const r = checkRecipient('email', raw);
        if (r.error) ctx.addIssue({ code: 'custom', message: `${label}: ${r.error}` });
      }
    })
    .transform((v) => splitList(v).map((raw) => checkRecipient('email', raw).value ?? raw).join(', '));
}

export function splitList(v: string): string[] {
  return v
    .split(/[,;\n]/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The fields alone — the shape the OpenAPI spec documents. */
export const communicationTemplateBaseSchema = z
  .object({
    template_key: z
      .string()
      .trim()
      .min(1, 'Key is required.')
      .max(100, 'Key must be 100 characters or fewer.')
      .regex(/^[a-z0-9][a-z0-9._-]*$/u, 'Key: use lower-case letters, digits, dots, dashes or underscores (e.g. import.cleared).'),
    name: z.string().trim().min(1, 'Name is required.').max(150, 'Name must be 150 characters or fewer.'),
    page_slug: z.enum(STAGE_SLUGS, { errorMap: () => ({ message: 'Stage: choose one of the listed stages.' }) }),
    trigger: z.enum(COMMUNICATION_TRIGGERS, { errorMap: () => ({ message: 'Sent when: choose when this template is used.' }) }),
    trigger_key: z.string().trim().max(100, 'Field / event must be 100 characters or fewer.').default(''),
    trigger_value: z.string().trim().max(200, 'Only when the value is must be 200 characters or fewer.').default(''),
    auto_email: z.boolean().default(false),
    auto_whatsapp: z.boolean().default(false),
    recipient: z.enum(COMMUNICATION_RECIPIENTS, { errorMap: () => ({ message: 'Send to: choose which client contacts receive it.' }) }),
    extra_to: emailList('Always send to'),
    cc: emailList('Cc'),
    email_subject: z.string().trim().min(1, 'Email Subject is required.').max(200, 'Email Subject must be 200 characters or fewer.'),
    email_body: z.string().max(50_000, 'Email Body is too long — shorten it.'),
    whatsapp_body: z
      .string()
      .trim()
      .min(1, 'WhatsApp Message is required.')
      .max(WHATSAPP_TEXT_MAX, `WhatsApp Message must be ${WHATSAPP_TEXT_MAX} characters or fewer.`),
    display: z.enum(['Y', 'N']).default('Y'),
  });

export const communicationTemplateSchema = communicationTemplateBaseSchema
  .superRefine((v, ctx) => {
    if (isBlankHtml(sanitizeHtml(v.email_body))) {
      ctx.addIssue({ code: 'custom', path: ['email_body'], message: 'Email Body is required — write the text to send.' });
    }
    if (v.trigger === 'field_change' && !v.trigger_key) {
      ctx.addIssue({ code: 'custom', path: ['trigger_key'], message: 'Field: choose the field whose change sends this message.' });
    }
    if (v.trigger === 'event' && !v.trigger_key) {
      ctx.addIssue({ code: 'custom', path: ['trigger_key'], message: 'Event: enter the system event key (e.g. import_invoice.validated).' });
    }
    if (v.trigger === 'manual' && (v.auto_email || v.auto_whatsapp)) {
      ctx.addIssue({
        code: 'custom',
        path: ['trigger'],
        message: 'A manual template is never sent on its own — choose another "Sent when", or switch automatic sending off.',
      });
    }
  })
  .transform((v) => ({
    ...v,
    email_body: sanitizeHtml(v.email_body),
    trigger_key: v.trigger === 'create' || v.trigger === 'manual' ? '' : v.trigger_key,
    trigger_value: v.trigger === 'field_change' ? v.trigger_value : '',
  }));
export type CommunicationTemplateInput = z.output<typeof communicationTemplateSchema>;

export const communicationTemplateIdSchema = z.coerce
  .number({ invalid_type_error: 'Template id must be a number.' })
  .int()
  .positive('Template id must be a positive number.');

/** GET /api/v1/outbound-messages/draft — the composer pre-filled for one record. */
export const stageDraftQuerySchema = z.object({
  slug: z.enum(STAGE_SLUGS, { errorMap: () => ({ message: 'This screen cannot send messages about its records.' }) }),
  id: z.coerce.number({ invalid_type_error: 'Record id must be a number.' }).int().positive('Record id must be a positive number.'),
  channel: z.enum(OUTBOUND_CHANNELS, { errorMap: () => ({ message: 'Channel must be Email or WhatsApp.' }) }),
});
export type StageDraftQuery = z.infer<typeof stageDraftQuerySchema>;

/**
 * POST /api/v1/outbound-messages — the optional link from a message sent by
 * hand to the stage record it is about (the row's mail / WhatsApp button).
 */
export const outboundLinkSchema = z
  .object({
    entity_type: z.enum(STAGE_SLUGS, { errorMap: () => ({ message: 'The record this message is about is not a known stage.' }) }).optional(),
    entity_id: z.coerce.number().int().positive('The record id must be a positive number.').optional(),
    template_key: z.string().trim().max(100).optional(),
  })
  .refine((v) => (v.entity_type === undefined) === (v.entity_id === undefined), {
    message: 'A message linked to a record needs both the stage and the record id.',
    path: ['entity_id'],
  });
