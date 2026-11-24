import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session, permission check, database and audit writer are mocked: these tests
// pin the route's own contract — who may call it, what it parses, what it
// stores, what it audits.
const getSession = vi.fn();
const checkPermission = vi.fn();
const recordAudit = vi.fn();
const returning = vi.fn();
const values = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/lib/audit/recordAudit', () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock('@/lib/db', () => {
  const tx = {
    insert: () => ({
      values: (v: unknown) => {
        values(v);
        return { returning: () => returning() };
      },
    }),
  };
  return { db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/apurement-options', {
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

describe('POST /api/v1/apurement-options', () => {
  it('creates a Type, gated on add, and audits it', async () => {
    returning.mockResolvedValue([{ id: 5, option_group: 'type', option_name: 'Partielle', requires_remark: true }]);
    const res = await POST(post({ option_group: 'type', option_name: '  Partielle ', requires_remark: true }));
    expect(res.status).toBe(201);
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/masters/apurement-options', 'add');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ optionName: 'Partielle', requiresRemark: true }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'create', entityType: 'apurement_option', entityId: '5' }),
    );
  });

  it('never stores "requires remark" on a Remarque', async () => {
    returning.mockResolvedValue([{ id: 6 }]);
    await POST(post({ option_group: 'remark', option_name: 'AV Provisional', requires_remark: true }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ requiresRemark: false }));
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post({ option_group: 'type', option_name: 'X' }));
    expect(res.status).toBe(401);
    expect(returning).not.toHaveBeenCalled();
  });

  it('refuses a role without add on the master', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(post({ option_group: 'type', option_name: 'X' }));
    expect(res.status).toBe(403);
    expect(returning).not.toHaveBeenCalled();
  });

  it('names the dropdown when the group is unknown', async () => {
    const res = await POST(post({ option_group: 'status', option_name: 'X' }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('Type or Remarque');
  });
});
