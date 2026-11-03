import type { OutboundResult } from '@/db/schema';
import type { OutgoingFile } from './email';

// Email through Microsoft 365 / Outlook — the Microsoft Graph `sendMail` API,
// plain fetch, no SDK.
//
// Graph rather than Outlook's SMTP endpoint because Microsoft is retiring
// basic-auth SMTP submission for Exchange Online: a tenant that has switched it
// off refuses smtp.office365.com with a username and password, while an app
// registration keeps working. Configured in the environment:
//
//   OUTLOOK_TENANT_ID      Entra ID → Overview → Directory (tenant) ID
//   OUTLOOK_CLIENT_ID      the app registration's Application (client) ID
//   OUTLOOK_CLIENT_SECRET  a client secret of that registration
//   OUTLOOK_SENDER         the mailbox the mail is sent from, e.g. ops@company.cd
//
// The registration needs the Microsoft Graph APPLICATION permission Mail.Send
// with admin consent. Sent mail is saved to the sender mailbox's Sent Items, so
// it reads like mail the team sent from Outlook themselves.

const LOGIN = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 60_000;
/**
 * Graph caps one request at 4 MB, and an inline attachment travels as base64
 * (a third larger). Anything above this goes through a draft and upload
 * sessions instead of one `sendMail` call.
 */
const INLINE_ATTACHMENT_BYTES = 2_500_000;
/** Upload-session chunks must be multiples of 320 KiB. */
const CHUNK_BYTES = 320 * 1024 * 10;

interface OutlookConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
}

function outlookConfig(): OutlookConfig | null {
  const tenantId = process.env.OUTLOOK_TENANT_ID?.trim();
  const clientId = process.env.OUTLOOK_CLIENT_ID?.trim();
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET?.trim();
  const sender = process.env.OUTLOOK_SENDER?.trim();
  if (!tenantId || !clientId || !clientSecret || !sender) return null;
  return { tenantId, clientId, clientSecret, sender };
}

export function outlookConfigured(): boolean {
  return outlookConfig() !== null;
}

/** A refused call, carrying the translated sentence. */
class OutlookError extends Error {}

interface GraphErrorBody {
  error?: { code?: string; message?: string } | string;
  error_description?: string;
}

/** What Microsoft's refusal means, in words an operator can act on (§4.39). */
export function describeOutlookError(status: number, body: unknown): string {
  const b = (body ?? {}) as GraphErrorBody;
  // The token endpoint answers { error: 'invalid_client', error_description }.
  if (typeof b.error === 'string') {
    const desc = (b.error_description ?? '').split('\r\n')[0]?.trim() ?? '';
    if (b.error === 'invalid_client' || b.error === 'unauthorized_client') {
      return `Outlook rejected the application sign-in — an administrator must check OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET (the secret may have expired)${desc ? `: ${desc}` : '.'}`;
    }
    if (b.error === 'invalid_request' || b.error === 'invalid_tenant') {
      return `Outlook does not recognise the tenant — an administrator must check OUTLOOK_TENANT_ID${desc ? `: ${desc}` : '.'}`;
    }
    return `Outlook refused the sign-in (${b.error})${desc ? `: ${desc}` : '.'}`;
  }
  const code = b.error?.code ?? '';
  const message = b.error?.message ?? '';
  const sender = process.env.OUTLOOK_SENDER ?? 'OUTLOOK_SENDER';
  switch (code) {
    case 'ErrorAccessDenied':
    case 'Authorization_RequestDenied':
      return 'Outlook refused to send — the app registration needs the Microsoft Graph application permission Mail.Send with admin consent.';
    case 'ErrorInvalidUser':
    case 'MailboxNotEnabledForRESTAPI':
    case 'ResourceNotFound':
    case 'Request_ResourceNotFound':
      return `Outlook has no usable mailbox "${sender}" — an administrator must set OUTLOOK_SENDER to a licensed Exchange Online mailbox.`;
    case 'ErrorInvalidRecipients':
      return `Outlook refused the recipients${message ? `: ${message}` : ''}.`;
    case 'ErrorMessageSizeExceeded':
      return 'Outlook refused the email as too large — remove or shrink an attachment.';
    case 'ErrorQuotaExceeded':
      return `The "${sender}" mailbox is full — free space in it, then try again.`;
  }
  if (status === 429 || code === 'ApplicationThrottled' || code === 'ErrorExceededMessageLimit') {
    return 'Outlook is limiting how fast this mailbox can send — wait a few minutes and try again.';
  }
  if (status === 401) {
    return 'Outlook rejected the access token — an administrator must check the OUTLOOK_* settings.';
  }
  return `Outlook refused the email (HTTP ${status})${message ? `: ${message}` : ''}.`;
}

async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    throw new OutlookError(
      timedOut
        ? `Outlook did not answer in time while ${what} — try again shortly.`
        : `Could not reach Microsoft (${new URL(url).host}) from this server while ${what} — check its internet connection.`,
    );
  }
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function accessToken(cfg: OutlookConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  // A minute of slack, so a token never expires between this check and the send.
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const res = await call(
    `${LOGIN}/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
    'signing in',
  );
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !data?.access_token) throw new OutlookError(describeOutlookError(res.status, data));
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, key };
  return data.access_token;
}

async function graph(cfg: OutlookConfig, path: string, body: unknown, what: string): Promise<Response> {
  const token = await accessToken(cfg);
  const res = await call(
    `${GRAPH}/users/${encodeURIComponent(cfg.sender)}${path}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    what,
  );
  if (!res.ok) throw new OutlookError(describeOutlookError(res.status, await res.json().catch(() => null)));
  return res;
}

const address = (a: string): { emailAddress: { address: string } } => ({ emailAddress: { address: a } });

function fileAttachment(f: OutgoingFile): Record<string, unknown> {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: f.name,
    contentType: f.mime ?? 'application/octet-stream',
    contentBytes: f.data.toString('base64'),
  };
}

/** A file too big for one request, uploaded in chunks to an existing draft. */
async function uploadLarge(cfg: OutlookConfig, messageId: string, f: OutgoingFile): Promise<void> {
  const session = await graph(
    cfg,
    `/messages/${encodeURIComponent(messageId)}/attachments/createUploadSession`,
    { AttachmentItem: { attachmentType: 'file', name: f.name, size: f.data.length, contentType: f.mime ?? 'application/octet-stream' } },
    `preparing "${f.name}"`,
  );
  const { uploadUrl } = (await session.json()) as { uploadUrl: string };
  for (let start = 0; start < f.data.length; start += CHUNK_BYTES) {
    const chunk = f.data.subarray(start, Math.min(start + CHUNK_BYTES, f.data.length));
    // The upload URL is pre-authorised — sending a bearer token to it is refused.
    const res = await call(
      uploadUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${start + chunk.length - 1}/${f.data.length}`,
        },
        body: new Uint8Array(chunk),
      },
      `uploading "${f.name}"`,
    );
    if (!res.ok) {
      throw new OutlookError(`Outlook did not accept the attachment "${f.name}" — ${describeOutlookError(res.status, await res.json().catch(() => null))}`);
    }
  }
}

/**
 * Sends one email from OUTLOOK_SENDER. Graph accepts or refuses the message as
 * a whole — it does not report per-recipient outcomes the way SMTP does — so
 * every recipient shares the outcome, and a bounce later arrives in the
 * sender's Outlook inbox like any other.
 */
export async function sendOutlookEmail(args: {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  files: OutgoingFile[];
}): Promise<OutboundResult[]> {
  const all = [...args.to, ...args.cc, ...args.bcc];
  const cfg = outlookConfig();
  if (!cfg) return all.map((recipient) => ({ recipient, status: 'failed', error: 'Outlook is not configured on this server.' }));

  const message = {
    subject: args.subject,
    body: { contentType: 'HTML', content: args.html },
    toRecipients: args.to.map(address),
    ccRecipients: args.cc.map(address),
    bccRecipients: args.bcc.map(address),
  };
  const totalBytes = args.files.reduce((s, f) => s + f.data.length, 0);

  try {
    let providerId: string;
    if (totalBytes <= INLINE_ATTACHMENT_BYTES) {
      const res = await graph(
        cfg,
        '/sendMail',
        { message: { ...message, attachments: args.files.map(fileAttachment) }, saveToSentItems: true },
        'sending',
      );
      providerId = res.headers.get('request-id') ?? '';
    } else {
      // Draft → attachments → send: the only route for files above Graph's
      // single-request limit.
      const draft = await graph(cfg, '/messages', message, 'creating the draft');
      const { id } = (await draft.json()) as { id: string };
      for (const f of args.files) {
        if (f.data.length <= INLINE_ATTACHMENT_BYTES) {
          await graph(cfg, `/messages/${encodeURIComponent(id)}/attachments`, fileAttachment(f), `attaching "${f.name}"`);
        } else {
          await uploadLarge(cfg, id, f);
        }
      }
      const sent = await graph(cfg, `/messages/${encodeURIComponent(id)}/send`, undefined, 'sending');
      providerId = sent.headers.get('request-id') ?? id;
    }
    return all.map((recipient) => ({ recipient, status: 'sent', provider_id: providerId }));
  } catch (err) {
    const error = err instanceof OutlookError ? err.message : `Outlook could not send the email: ${(err as Error)?.message ?? String(err)}`;
    return all.map((recipient) => ({ recipient, status: 'failed', error }));
  }
}
