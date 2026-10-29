import type { OutboundResult } from '@/db/schema';
import type { OutgoingFile } from './email';
import { CHANNEL_NOT_CONFIGURED } from './setup';

// WhatsApp through Meta's Cloud API — plain fetch, no SDK.
//
// Configured in the environment, like SMTP:
//
//   WHATSAPP_PHONE_NUMBER_ID   the sending number's id (Meta Business → WhatsApp → API setup)
//   WHATSAPP_ACCESS_TOKEN      a permanent system-user token with whatsapp_business_messaging
//   WHATSAPP_API_VERSION       optional, default v21.0
//
// A free-form message is only delivered to someone who has written to the
// business number in the last 24 hours; outside that window Meta refuses it
// (error 131047) and an approved template is required. That refusal is
// translated below rather than reported as a generic failure.

const GRAPH = 'https://graph.facebook.com';
const TIMEOUT_MS = 30_000;

interface WhatsAppConfig {
  phoneNumberId: string;
  token: string;
  version: string;
}

function whatsappConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token, version: process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0' };
}

export function whatsappConfigured(): boolean {
  return whatsappConfig() !== null;
}


interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
}

/** What Meta's refusal means, in words an operator can act on (§4.39). */
export function describeWhatsAppError(status: number, body: unknown): string {
  const e: GraphError = ((body as { error?: GraphError } | null)?.error ?? {}) as GraphError;
  const detail = e.error_data?.details || e.message || '';
  switch (e.code) {
    case 131047:
      return 'WhatsApp only delivers a free-form message to someone who has written to the business number in the last 24 hours — ask them to message you first, or send by email.';
    case 131026:
    case 133010:
      return 'This number is not on WhatsApp, or cannot receive messages — check the number or send by email.';
    case 131051:
      return 'WhatsApp does not accept this type of message or file.';
    case 131052:
    case 131053:
      return `WhatsApp could not process the attachment${detail ? ` (${detail})` : ''} — try a PDF or a smaller file.`;
    case 130429:
    case 131056:
    case 80007:
      return 'WhatsApp is limiting how fast this number can send — wait a few minutes and try again.';
    case 190:
      return 'The WhatsApp access token has expired or been revoked — an administrator must issue a new WHATSAPP_ACCESS_TOKEN.';
    case 10:
    case 200:
      return 'The WhatsApp access token is missing the whatsapp_business_messaging permission — an administrator must grant it in Meta Business settings.';
    case 100:
      return `WhatsApp rejected the request${detail ? `: ${detail}` : ''}.`;
  }
  if (status === 401) return 'WhatsApp rejected the access token — an administrator must check WHATSAPP_ACCESS_TOKEN.';
  if (status >= 500) return `WhatsApp is not available right now (HTTP ${status}) — try again shortly.`;
  return `WhatsApp refused the message (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
}

/** A refused call, carrying the translated sentence. */
class WhatsAppError extends Error {}

async function graph(cfg: WhatsAppConfig, path: string, body: BodyInit, json: boolean): Promise<{ id?: string; messages?: Array<{ id: string }> }> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${cfg.version}/${cfg.phoneNumberId}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    throw new WhatsAppError(
      timedOut
        ? 'WhatsApp did not answer in time — try again shortly.'
        : 'Could not reach WhatsApp (graph.facebook.com) from this server — check its internet connection.',
    );
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new WhatsAppError(describeWhatsAppError(res.status, data));
  return (data ?? {}) as { id?: string; messages?: Array<{ id: string }> };
}

async function uploadMedia(cfg: WhatsAppConfig, file: OutgoingFile): Promise<string> {
  const form = new FormData();
  const mime = file.mime || 'application/octet-stream';
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([new Uint8Array(file.data)], { type: mime }), file.name);
  const r = await graph(cfg, 'media', form, false);
  if (!r.id) throw new WhatsAppError(`WhatsApp did not accept the attachment "${file.name}".`);
  return r.id;
}

async function sendMessage(cfg: WhatsAppConfig, to: string, payload: Record<string, unknown>): Promise<string> {
  const r = await graph(
    cfg,
    'messages',
    JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/\D/gu, ''), ...payload }),
    true,
  );
  return r.messages?.[0]?.id ?? '';
}

/**
 * The text, then each attachment as a document, to every number. Attachments
 * are uploaded once and reused, so ten recipients do not mean ten uploads.
 */
export async function sendWhatsApp(args: { to: string[]; text: string; files: OutgoingFile[] }): Promise<OutboundResult[]> {
  const cfg = whatsappConfig();
  if (!cfg) throw new Error(CHANNEL_NOT_CONFIGURED.whatsapp);

  let mediaIds: string[];
  try {
    mediaIds = [];
    for (const f of args.files) mediaIds.push(await uploadMedia(cfg, f));
  } catch (err) {
    const error = err instanceof WhatsAppError ? err.message : `Unexpected error: ${(err as Error)?.message}`;
    return args.to.map((recipient) => ({ recipient, status: 'failed', error }));
  }

  const results: OutboundResult[] = [];
  for (const recipient of args.to) {
    try {
      const providerId = await sendMessage(cfg, recipient, { type: 'text', text: { body: args.text, preview_url: true } });
      for (let i = 0; i < mediaIds.length; i += 1) {
        await sendMessage(cfg, recipient, {
          type: 'document',
          document: { id: mediaIds[i], filename: args.files[i].name },
        });
      }
      results.push({ recipient, status: 'sent', provider_id: providerId });
    } catch (err) {
      results.push({
        recipient,
        status: 'failed',
        error: err instanceof WhatsAppError ? err.message : `Unexpected error: ${(err as Error)?.message}`,
      });
    }
  }
  return results;
}
