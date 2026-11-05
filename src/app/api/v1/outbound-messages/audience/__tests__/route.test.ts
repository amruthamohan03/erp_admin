import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, permission check and audience query are mocked: these pin who
// may ask, that the conditions are validated before any query, and the answer.
const getSession = vi.fn();
const checkPermission = vi.fn();
const resolveAudience = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/outboundAudience', () => ({
  resolveAudience: (...a: unknown[]) => resolveAudience(...a),
  audienceStageOptions: () => ({ import: [{ key: 'crf_missing', label: 'CRF Missing' }], export: [] }),
}));
vi.mock('@/lib/db', () => ({ db: {} }));

const { GET, POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };
const post = (body: unknown): NextRequest =>
  new NextRequest('http://localhost/api/v1/outbound-messages/audience', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
});

describe('GET /api/v1/outbound-messages/audience', () => {
  it('lists each module\'s pending stages', async () => {
    const json = await (await GET()).json();
    expect(json.data.stages.import).toEqual([{ key: 'crf_missing', label: 'CRF Missing' }]);
  });
});

describe('POST /api/v1/outbound-messages/audience', () => {
  it('returns the matching clients with a file total', async () => {
    resolveAudience.mockResolvedValue([
      { client_id: 4, short_name: 'NMI', file_count: 3, refs: ['NMI-1'] },
      { client_id: 9, short_name: 'KAM', file_count: 2, refs: [] },
    ]);
    const res = await POST(post({ module: 'import', stages: ['crf_missing'] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.meta).toMatchObject({ total: 2, file_count: 5 });
    expect(resolveAudience.mock.calls[0][1]).toMatchObject({ module: 'import', stages: ['crf_missing'] });
  });

  it('refuses a request with no condition before querying', async () => {
    const res = await POST(post({ module: 'import' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/at least one condition/u);
    expect(resolveAudience).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post({ module: 'import', stages: ['crf_missing'] }));
    expect(res.status).toBe(401);
    expect(resolveAudience).not.toHaveBeenCalled();
  });

  it('refuses without add permission on /communications', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(post({ module: 'import', stages: ['crf_missing'] }));
    expect(res.status).toBe(403);
    expect(checkPermission.mock.calls[0]).toEqual(expect.arrayContaining(['/communications', 'add']));
  });
});
