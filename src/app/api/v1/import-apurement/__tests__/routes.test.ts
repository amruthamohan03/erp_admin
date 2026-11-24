import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The query layer is mocked: these tests pin each route's contract — which
// permission it asks for, what it parses, what it hands the query layer.
const getSession = vi.fn();
const checkPermission = vi.fn();
const createTransmission = vi.fn();
const saveApurementRows = vi.fn();
const deleteTransmission = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/importApurement', () => ({
  createTransmission: (...a: unknown[]) => createTransmission(...a),
  saveApurementRows: (...a: unknown[]) => saveApurementRows(...a),
  deleteTransmission: (...a: unknown[]) => deleteTransmission(...a),
  listTransmissions: vi.fn(),
  listPendingFiles: vi.fn(),
  getTransmission: vi.fn(),
  transmissionFiles: vi.fn(),
}));

const transmissions = await import('../transmissions/route');
const pending = await import('../pending/route');
const one = await import('../transmissions/[id]/route');

const SESSION = { uid: 3, username: 'ops', role_id: 2 };
const RESOURCE = '/import-apurement';

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID = { client_id: 4, license_id: 9, bank_id: 2, transmission_date: '2026-11-20', date_depot: '2026-11-21' };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
});

describe('POST /api/v1/import-apurement/transmissions', () => {
  it('creates a transmission, gated on add, without taking a reference from the caller', async () => {
    createTransmission.mockResolvedValue({ id: 11, reference: '0007-IB-MCA-26', files: 3 });
    const res = await transmissions.POST(req('/api/v1/import-apurement/transmissions', 'POST', { ...VALID, reference: 'TYPED' }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toEqual({ id: 11, reference: '0007-IB-MCA-26', files: 3 });
    expect(checkPermission).toHaveBeenCalledWith(SESSION, RESOURCE, 'add');
    // §4.33 — the generator issues the reference; a typed one never reaches the query.
    expect(createTransmission).toHaveBeenCalledWith(VALID, 3);
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await transmissions.POST(req('/api/v1/import-apurement/transmissions', 'POST', VALID));
    expect(res.status).toBe(401);
    expect(createTransmission).not.toHaveBeenCalled();
  });

  it('refuses a role without add', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await transmissions.POST(req('/api/v1/import-apurement/transmissions', 'POST', VALID));
    expect(res.status).toBe(403);
    expect(createTransmission).not.toHaveBeenCalled();
  });

  it('names the field when the deposit date is before the transmission date', async () => {
    const res = await transmissions.POST(
      req('/api/v1/import-apurement/transmissions', 'POST', { ...VALID, date_depot: '2026-11-19' }),
    );
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('Date Depot');
    expect(createTransmission).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/import-apurement/pending', () => {
  it('saves the edited rows, gated on edit, with a cleared dropdown as null', async () => {
    saveApurementRows.mockResolvedValue({ saved: 2 });
    const res = await pending.POST(
      req('/api/v1/import-apurement/pending', 'POST', {
        rows: [
          { import_id: 1, ass_ref: '  ASS-1 ', clearance_type_id: 2 },
          { import_id: 2, clearance_remark_id: '' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(checkPermission).toHaveBeenCalledWith(SESSION, RESOURCE, 'edit');
    expect(saveApurementRows).toHaveBeenCalledWith(
      [
        { import_id: 1, ass_ref: 'ASS-1', clearance_type_id: 2 },
        { import_id: 2, clearance_remark_id: null },
      ],
      3,
    );
  });

  it('refuses an empty save with a sentence', async () => {
    const res = await pending.POST(req('/api/v1/import-apurement/pending', 'POST', { rows: [] }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('nothing to save');
  });

  it('refuses a role without edit', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await pending.POST(req('/api/v1/import-apurement/pending', 'POST', { rows: [{ import_id: 1 }] }));
    expect(res.status).toBe(403);
    expect(saveApurementRows).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/import-apurement/transmissions/{id}', () => {
  it('deletes, gated on delete', async () => {
    deleteTransmission.mockResolvedValue({ transmission_reference: '0001-IB-MCA-26', file_count: 4 });
    const res = await one.DELETE(req('/api/v1/import-apurement/transmissions/8', 'DELETE'), {
      params: Promise.resolve({ id: '8' }),
    });
    expect(res.status).toBe(200);
    expect(checkPermission).toHaveBeenCalledWith(SESSION, RESOURCE, 'delete');
    expect(deleteTransmission).toHaveBeenCalledWith(8, 3);
  });

  it('names a malformed id', async () => {
    const res = await one.DELETE(req('/api/v1/import-apurement/transmissions/abc', 'DELETE'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.message).toContain('"abc"');
  });
});
