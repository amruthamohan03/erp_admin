import nodemailer, { type Transporter } from 'nodemailer';
import type { NotificationChannel } from '@/lib/notifications';

// SMTP-based email channel for the notification outbox.
//
// Configured entirely via env vars so the project stays provider-agnostic
// — drop in Gmail, AWS SES SMTP, Mailgun SMTP, Postmark SMTP, or a local
// MailHog by changing `.env.local`:
//
//   SMTP_HOST       (required to activate; if absent, defaultChannels in
//                   notifications.ts falls back to consoleChannel for email)
//   SMTP_PORT       (default 587)
//   SMTP_SECURE     ("true" forces TLS; auto-detected for port 465 otherwise)
//   SMTP_USER       (optional — auth username)
//   SMTP_PASSWORD   (optional — auth password)
//   SMTP_FROM       (required when SMTP_HOST is set — sender address)
//
// The template column on the outbox row is the template name; rendering
// it to subject + body is the caller's job today. A future slice can
// wire in a template renderer (Handlebars / MJML / etc.) and a template
// master table; for now the email body just echoes the row's metadata so
// admins can verify the wiring without committing to a template engine.
//
// Returns null when SMTP_HOST isn't configured so the consumer (defaults
// in notifications.ts) can fall back to consoleChannel — keeps `npm run
// dispatch:notifications` working out of the box in dev.

let cachedTransporter: Transporter | null = null;

function transporterFromEnv(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (cachedTransporter) return cachedTransporter;
  const port = process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : 587;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure:
      process.env.SMTP_SECURE === 'true' ||
      (process.env.SMTP_SECURE !== 'false' && port === 465),
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
  });
  return cachedTransporter;
}

export function buildSmtpEmailChannel(): NotificationChannel | null {
  const transporter = transporterFromEnv();
  if (!transporter) return null;
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error(
      'SMTP_FROM is required when SMTP_HOST is set — set the sender address in .env.local',
    );
  }
  return {
    async send(row) {
      // Minimal rendering: subject = template name, body = JSON of the row's
      // payload + template + case linkage. Real templating lands when a
      // notification_template_master_t lands.
      const subject = `[${row.template}] notification`;
      const body = JSON.stringify(
        {
          template: row.template,
          templateKey: row.templateKey,
          caseId: row.caseId,
          payload: row.payload,
        },
        null,
        2,
      );
      await transporter.sendMail({
        from,
        to: row.recipient,
        subject,
        text: body,
      });
    },
  };
}
