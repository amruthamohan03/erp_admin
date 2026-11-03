import type { OutboundResult } from '@/db/schema';
import type { OutboundChannel } from '@/schemas/outboundMessages';
import { sendEmail, type OutgoingFile } from './email';
import { sendWhatsApp } from './whatsapp';

// One composed message handed to its channel's provider. Shared by the
// Email & WhatsApp composer's route and the automatic stage-message drain, so
// both send the same way and report outcomes in the same shape (§4.10).

export interface OutgoingMessage {
  channel: OutboundChannel;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  /** Email: the plain-text alternative. WhatsApp: the whole message. */
  text: string;
  files: OutgoingFile[];
}

export async function deliverOutbound(m: OutgoingMessage): Promise<OutboundResult[]> {
  return m.channel === 'email'
    ? sendEmail({ to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject, html: m.html, text: m.text, files: m.files })
    : sendWhatsApp({ to: m.to, text: m.text, files: m.files });
}
