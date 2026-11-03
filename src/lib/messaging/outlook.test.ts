import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeOutlookError, outlookConfigured, sendOutlookEmail } from './outlook';
import { emailProvider } from './email';

const OUTLOOK_ENV = {
  OUTLOOK_TENANT_ID: 'tenant',
  OUTLOOK_CLIENT_ID: 'client',
  OUTLOOK_CLIENT_SECRET: 'secret',
  OUTLOOK_SENDER: 'ops@company.cd',
};

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const CLEAR = {
  OUTLOOK_TENANT_ID: undefined,
  OUTLOOK_CLIENT_ID: undefined,
  OUTLOOK_CLIENT_SECRET: undefined,
  OUTLOOK_SENDER: undefined,
  SMTP_HOST: undefined,
  EMAIL_PROVIDER: undefined,
};

afterEach(() => {
  setEnv(CLEAR);
  vi.unstubAllGlobals();
});

describe('emailProvider', () => {
  it('is null when nothing is configured', () => {
    setEnv(CLEAR);
    expect(emailProvider()).toBeNull();
  });

  it('prefers Outlook when both are configured', () => {
    setEnv({ ...OUTLOOK_ENV, SMTP_HOST: 'smtp.example.com' });
    expect(outlookConfigured()).toBe(true);
    expect(emailProvider()).toBe('outlook');
  });

  it('honours EMAIL_PROVIDER=smtp', () => {
    setEnv({ ...OUTLOOK_ENV, SMTP_HOST: 'smtp.example.com', EMAIL_PROVIDER: 'smtp' });
    expect(emailProvider()).toBe('smtp');
  });

  it('needs all four Outlook settings', () => {
    setEnv({ ...OUTLOOK_ENV, OUTLOOK_SENDER: undefined });
    expect(outlookConfigured()).toBe(false);
    expect(emailProvider()).toBeNull();
  });
});

describe('describeOutlookError', () => {
  it('names the credentials on a bad client secret', () => {
    expect(describeOutlookError(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret.' })).toMatch(
      /OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET/u,
    );
  });

  it('names the missing Mail.Send permission', () => {
    expect(describeOutlookError(403, { error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } })).toMatch(/Mail\.Send/u);
  });

  it('names the sender mailbox when it does not exist', () => {
    setEnv(OUTLOOK_ENV);
    expect(describeOutlookError(404, { error: { code: 'ErrorInvalidUser' } })).toContain('"ops@company.cd"');
  });

  it('says to wait when throttled', () => {
    expect(describeOutlookError(429, {})).toMatch(/wait a few minutes/u);
  });

  it('falls back to the status and Microsoft\'s own reason', () => {
    expect(describeOutlookError(500, { error: { code: 'X', message: 'Boom' } })).toBe('Outlook refused the email (HTTP 500): Boom.');
  });
});

describe('sendOutlookEmail', () => {
  beforeEach(() => setEnv(OUTLOOK_ENV));

  it('signs in, then sends one sendMail with inline attachments', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: init.body });
        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        return new Response(null, { status: 202, headers: { 'request-id': 'req-1' } });
      }),
    );
    const results = await sendOutlookEmail({
      to: ['a@client.cd'],
      cc: ['b@client.cd'],
      bcc: [],
      subject: 'Licence registered',
      html: '<p>Hi</p>',
      files: [{ name: 'x.pdf', mime: 'application/pdf', data: Buffer.from('pdf') }],
    });
    expect(results).toEqual([
      { recipient: 'a@client.cd', status: 'sent', provider_id: 'req-1' },
      { recipient: 'b@client.cd', status: 'sent', provider_id: 'req-1' },
    ]);
    const send = calls.find((c) => c.url.endsWith('/sendMail'));
    expect(send?.url).toContain('/users/ops%40company.cd/sendMail');
    const payload = JSON.parse(String(send?.body)) as { message: { attachments: Array<{ contentBytes: string }> } };
    expect(payload.message.attachments[0]?.contentBytes).toBe(Buffer.from('pdf').toString('base64'));
  });

  it('reports a refusal against every recipient, in words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/oauth2/')
          ? new Response(JSON.stringify({ access_token: 'tok2', expires_in: 3600 }), { status: 200 })
          : new Response(JSON.stringify({ error: { code: 'ErrorAccessDenied' } }), { status: 403 }),
      ),
    );
    const results = await sendOutlookEmail({ to: ['a@client.cd'], cc: [], bcc: [], subject: 's', html: '<p>h</p>', files: [] });
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toMatch(/Mail\.Send/u);
  });
});
