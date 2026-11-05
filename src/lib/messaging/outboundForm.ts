import { AppError, BadRequestError, ValidationError } from '@/lib/errors';
import type { OutboundChannel } from '@/schemas/outboundMessages';
import { attachmentError } from './attachments';
import { emailConfigured, type OutgoingFile } from './email';
import { whatsappConfigured } from './whatsapp';
import { CHANNEL_NOT_CONFIGURED } from './setup';

// The multipart plumbing both send routes share — a single message and a bulk
// send by condition read their fields, attachments and channel set-up the same
// way, so the two cannot drift (§4.10).

/** A JSON field of the form, or `fallback` when it is absent or blank. */
export function jsonField(form: FormData, key: string, label: string, fallback: unknown = []): unknown {
  const raw = form.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError(`${label} must be sent as JSON — the request carried something else.`);
  }
}

/** The uploaded attachments, checked against the size and count limits. */
export async function readAttachments(form: FormData): Promise<OutgoingFile[]> {
  const files = form.getAll('attachments').filter((f): f is File => f instanceof File);
  const tooMuch = attachmentError(files);
  if (tooMuch) throw new ValidationError(tooMuch, { fields: { attachments: tooMuch } });
  return Promise.all(
    files.map(async (f) => ({ name: f.name, mime: f.type || null, data: Buffer.from(await f.arrayBuffer()) })),
  );
}

/** Refuses before anything is written when the channel has no provider set up. */
export function assertChannelConfigured(channel: OutboundChannel): void {
  const configured = channel === 'email' ? emailConfigured() : whatsappConfigured();
  if (!configured) throw new AppError(CHANNEL_NOT_CONFIGURED[channel], 503, 'INTERNAL_ERROR');
}
