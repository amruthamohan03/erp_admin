import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, the permission check, the database and the audit writer are
// mocked: these tests pin the route's own contract — who may call it, what it
// parses, what it audits, what it answers.
const getSession = vi.fn();
const checkPermission = vi.fn();
const recordAudit = vi.fn();
const returning = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/lib/audit/recordAudit', () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock('@/lib/db', () => {
  const tx = { insert: () => ({ values: () => ({ returning: () => returning() }) }) };
  return { db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { GET, POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/air-operating-companies', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
});

describe('POST /api/v1/air-operating-companies', () => {
  it('creates the operator, gated on add, and audits it', async () => {
    returning.mockResolvedValue([{ id: 7, air_operating_company_name: 'EMIRATES SKYCARGO', display: 'Y' }]);
    const res = await POST(post({ air_operating_company_name: '  EMIRATES SKYCARGO  ' }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ id: 7, air_operating_company_name: 'EMIRATES SKYCARGO' });
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/masters/air-operating-companies', 'add');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'create', entityType: 'air_operating_company', entityId: '7' }),
    );
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post({ air_operating_company_name: 'X' }));
    expect(res.status).toBe(401);
    expect(returning).not.toHaveBeenCalled();
  });

  it('refuses a role without add on the master', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(post({ air_operating_company_name: 'X' }));
    expect(res.status).toBe(403);
    expect(returning).not.toHaveBeenCalled();
  });

  it('names the field when the name is too long for a file to hold', async () => {
    const res = await POST(post({ air_operating_company_name: 'A'.repeat(51) }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('50 characters');
    expect(returning).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/air-operating-companies', () => {
  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/v1/air-operating-companies'));
    expect(res.status).toBe(401);
  });
});
