import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Providers, storage and the database are mocked: these pin that a bulk send
// writes ONE message per client (no client sees another's address), re-checks
// the conditions instead of trusting the preview, skips and names clients it
// cannot reach, stores attachments once, and is refused without permission.
const getSession = vi.fn();
const checkPermission = vi.fn();
const resolveAudience = vi.fn();
const deliverOutbound = vi.fn();
const finishOutbound = vi.fn();
const storeFile = vi.fn();
const recordAudit = vi.fn();
const inserted: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/outboundAudience', () => ({ resolveAudience: (...a: unknown[]) => resolveAudience(...a) }));
vi.mock('@/lib/messaging/deliver', () => ({ deliverOutbound: (...a: unknown[]) => deliverOutbound(...a) }));
vi.mock('@/db/queries/outboundMessages', () => ({
  OUTBOUND_ENTITY: 'outbound_message',
  finishOutbound: (...a: unknown[]) => finishOutbound(...a),
}));
vi.mock('@/db/queries/files', () => ({ storeFile: (...a: unknown[]) => storeFile(...a) }));
vi.mock('@/lib/audit', () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock('@/lib/messaging/email', () => ({ emailConfigured: () => true }));
vi.mock('@/lib/messaging/whatsapp', () => ({ whatsappConfigured: () => true }));
vi.mock('@/lib/db', () => {
  const tx = {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push(v);
          return [{ id: 100 + inserted.length }];
        },
      }),
    }),
  };
  return { db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };
const contacts = { email: null, email_secondary: null, payment_email: null, phone: null, phone_secondary: null, payment_phone: null };
const NMI = { client_id: 4, short_name: 'NMI', company_name: 'N', file_count: 2, refs: [], ...contacts, email: 'ops@nmi.cd' };
const KAM = { client_id: 9, short_name: 'KAM', company_name: 'K', file_count: 1, refs: [], ...contacts, email: 'desk@kam.cd' };
const NONE = { client_id: 12, short_name: 'ZZZ', company_name: 'Z', file_count: 1, refs: [], ...contacts };

function send(fields: Record<string, string>, files: File[] = []): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append('attachments', f);
  return new NextRequest('http://localhost/api/v1/outbound-messages/bulk', { method: 'POST', body: form });
}
const base = (clientIds: number[]): Record<string, string> => ({
  channel: 'email',
  subject: 'Your files',
  message: '<p>CRF is missing.</p>',
  audience: JSON.stringify({ module: 'import', stages: ['crf_missing'] }),
  contacts: JSON.stringify(['main']),
  client_ids: JSON.stringify(clientIds),
});

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
  resolveAudience.mockResolvedValue([NMI, KAM, NONE]);
  deliverOutbound.mockImplementation(async (m: { to: string[] }) => m.to.map((r) => ({ recipient: r, status: 'sent' })));
  finishOutbound.mockResolvedValue({ status: 'sent', error: null });
});

describe('POST /api/v1/outbound-messages/bulk', () => {
  it('sends one message per client, each to that client alone', async () => {
    const res = await POST(send(base([4, 9])));
    expect(res.status).toBe(201);
    expect(deliverOutbound).toHaveBeenCalledTimes(2);
    expect(deliverOutbound.mock.calls.map((c) => c[0].to)).toEqual([['ops@nmi.cd'], ['desk@kam.cd']]);
    expect(deliverOutbound.mock.calls[0][0]).toMatchObject({ cc: [], bcc: [] });
    expect(recordAudit).toHaveBeenCalledTimes(2);
    const json = await res.json();
    expect(json.data).toMatchObject({ batch_id: 101, messages: 2, sent: 2, failed: 0, skipped: [] });
  });

  it('points every row after the first at the batch, and stores attachments once', async () => {
    const pdf = new File(['%PDF-1.4'], 'notice.pdf', { type: 'application/pdf' });
    await POST(send(base([4, 9]), [pdf]));
    expect(inserted.map((r) => r.bulkParentId)).toEqual([null, 101]);
    expect(storeFile).toHaveBeenCalledTimes(1);
    expect(storeFile.mock.calls[0][1]).toMatchObject({ entityId: '101' });
  });

  it('skips and names a client with no address, and one that no longer matches', async () => {
    const res = await POST(send(base([4, 12, 77])));
    const json = await res.json();
    expect(json.data.messages).toBe(1);
    expect(json.data.skipped).toEqual([
      { client: 'ZZZ', reason: 'no email address on file for the chosen contacts' },
      { client: 'Client #77', reason: 'its files no longer meet the conditions' },
    ]);
  });

  it('refuses when no chosen client can be reached, sending nothing', async () => {
    const res = await POST(send(base([12])));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/Nothing was sent/u);
    expect(deliverOutbound).not.toHaveBeenCalled();
  });

  it('refuses a message with no subject before resolving anyone', async () => {
    const res = await POST(send({ ...base([4]), subject: '' }));
    expect(res.status).toBe(422);
    expect(resolveAudience).not.toHaveBeenCalled();
  });

  it('refuses without add permission on /communications', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(send(base([4])));
    expect(res.status).toBe(403);
    expect(deliverOutbound).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(send(base([4])))).status).toBe(401);
  });
});
