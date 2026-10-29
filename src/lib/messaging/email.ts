import { smtpSender } from '@/lib/notificationChannels/email';
import type { OutboundResult } from '@/db/schema';
import { CHANNEL_NOT_CONFIGURED } from './setup';

// Sends one composed email through the configured SMTP server and reports how
// each recipient fared. The SMTP connection itself is configured in .env and
// shared with the notification outbox (smtpSender).

export interface OutgoingFile {
  name: string;
  mime: string | null;
  data: Buffer;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}


interface SmtpErrorLike {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
}

/** What the mail server's refusal means, in words an operator can act on (§4.39). */
export function describeSmtpError(err: unknown): string {
  const e = (err ?? {}) as SmtpErrorLike;
  const reason = (e.response || e.message || '').trim();
  switch (e.code) {
    case 'EAUTH':
      return 'The mail server rejected the sign-in — an administrator must correct SMTP_USER / SMTP_PASSWORD.';
    case 'ECONNECTION':
    case 'ESOCKET':
    case 'ECONNREFUSED':
    case 'EDNS':
      return `Could not connect to the mail server (${process.env.SMTP_HOST ?? 'SMTP_HOST'}) — check the server address and port, or try again shortly.`;
    case 'ETIMEDOUT':
      return 'The mail server did not answer in time — try again shortly.';
    case 'EENVELOPE':
      return `The mail server refused the recipients${reason ? `: ${reason}` : ''}.`;
    case 'EMESSAGE':
      return `The mail server refused the message${reason ? `: ${reason}` : ''}.`;
  }
  if (e.responseCode === 552) return 'The mail server refused the email as too large — remove or shrink an attachment.';
  return `The mail server refused the email${reason ? `: ${reason}` : ''}.`;
}

/** Sends to every address at once and splits the outcome per address. */
export async function sendEmail(args: {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  files: OutgoingFile[];
}): Promise<OutboundResult[]> {
  const smtp = smtpSender();
  if (!smtp) throw new Error(CHANNEL_NOT_CONFIGURED.email);
  const all = [...args.to, ...args.cc, ...args.bcc];
  try {
    const info = await smtp.transporter.sendMail({
      from: smtp.from,
      to: args.to,
      cc: args.cc.length ? args.cc : undefined,
      bcc: args.bcc.length ? args.bcc : undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.files.map((f) => ({
        filename: f.name,
        content: f.data,
        contentType: f.mime ?? undefined,
      })),
    });
    const refused: Array<string | { address: string }> = info.rejected ?? [];
    const rejected = new Set(refused.map((r) => (typeof r === 'string' ? r : r.address).toLowerCase()));
    return all.map((recipient) =>
      rejected.has(recipient.toLowerCase())
        ? { recipient, status: 'failed', error: 'The mail server refused this address.' }
        : { recipient, status: 'sent', provider_id: info.messageId },
    );
  } catch (err) {
    const error = describeSmtpError(err);
    return all.map((recipient) => ({ recipient, status: 'failed', error }));
  }
}
