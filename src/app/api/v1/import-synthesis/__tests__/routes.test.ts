import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The query layer is mocked: these tests pin each route's contract — which
// permission it asks for, what it parses, what it hands the query layer.
const getSession = vi.fn();
const checkPermission = vi.fn();
const synthesisLicenses = vi.fn();
const synthesisLicense = vi.fn();
const synthesisFiles = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/importSynthesis', async (orig) => ({
  ...(await orig<typeof import('@/db/queries/importSynthesis')>()),
  synthesisLicenses: (...a: unknown[]) => synthesisLicenses(...a),
  synthesisLicense: (...a: unknown[]) => synthesisLicense(...a),
  synthesisFiles: (...a: unknown[]) => synthesisFiles(...a),
}));

const list = await import('../licenses/route');
const one = await import('../licenses/[id]/route');

const SESSION = { uid: 3, username: 'ops', role_id: 2 };

const get = (url: string): NextRequest => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
});

describe('GET /api/v1/import-synthesis/licenses', () => {
  it('lists one kind for one client, gated on view', async () => {
    synthesisLicenses.mockResolvedValue([{ id: 1 }]);
    const res = await list.GET(get('/api/v1/import-synthesis/licenses?kind_id=2&client_id=7'));
    expect(res.status).toBe(200);
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/import-synthesis', 'view');
    expect(synthesisLicenses).toHaveBeenCalledWith(2, 7);
  });

  it('names the missing client', async () => {
    const res = await list.GET(get('/api/v1/import-synthesis/licenses?kind_id=2'));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('Client');
    expect(synthesisLicenses).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await list.GET(get('/api/v1/import-synthesis/licenses?kind_id=2&client_id=7'));
    expect(res.status).toBe(401);
  });

  it('refuses a role without view', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await list.GET(get('/api/v1/import-synthesis/licenses?kind_id=2&client_id=7'));
    expect(res.status).toBe(403);
    expect(synthesisLicenses).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/import-synthesis/licenses/{id}', () => {
  it('summarises what was sent to the bank against the licence FOB', async () => {
    synthesisLicense.mockResolvedValue({ id: 5, fob: 1000 });
    synthesisFiles.mockResolvedValue([
      { fob: 300, weight: 10, transmission_reference: '0001-IB-MCA-26' },
      { fob: 200, weight: 5, transmission_reference: null },
    ]);
    const res = await one.GET(get('/api/v1/import-synthesis/licenses/5'), { params: Promise.resolve({ id: '5' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.summary).toEqual({
      files: 2,
      fob: 500,
      weight: 15,
      transmitted: 1,
      transmitted_fob: 300,
      fob_not_transmitted: 700,
    });
  });

  it('says which licence was not found', async () => {
    synthesisLicense.mockResolvedValue(null);
    const res = await one.GET(get('/api/v1/import-synthesis/licenses/9'), { params: Promise.resolve({ id: '9' }) });
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error.message).toContain('#9');
  });
});
