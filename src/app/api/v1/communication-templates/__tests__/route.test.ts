import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, the permission check and the queries are mocked: these tests pin
// the route's own contract — who may call it, what it parses, what envelope it
// answers with — not the database.
const getSession = vi.fn();
const checkPermission = vi.fn();
const listCommunicationTemplates = vi.fn();
const createCommunicationTemplate = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/communicationTemplates', () => ({
  listCommunicationTemplates: () => listCommunicationTemplates(),
  createCommunicationTemplate: (...args: unknown[]) => createCommunicationTemplate(...args),
}));

const { GET, POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', roleId: 1 };
const BODY = {
  template_key: 'import.cleared',
  name: 'Import cleared',
  page_slug: 'import',
  trigger: 'field_change',
  trigger_key: 'clearing_status',
  recipient: 'client',
  email_subject: 'File {mca_ref} cleared',
  email_body: '<p>Dear {client_name}</p>',
  whatsapp_body: 'Dear {client_code}',
};

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/communication-templates', {
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

describe('GET /api/v1/communication-templates', () => {
  it('lists the templates with whether each channel is set up', async () => {
    listCommunicationTemplates.mockResolvedValue([{ id: 1, template_key: 'license.created' }]);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([{ id: 1, template_key: 'license.created' }]);
    expect(json.meta).toHaveProperty('email_configured');
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/masters/communication-templates', 'view');
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listCommunicationTemplates).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/communication-templates', () => {
  it('creates a template', async () => {
    createCommunicationTemplate.mockResolvedValue(9);
    const res = await POST(post(BODY));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ id: 9 });
    expect(createCommunicationTemplate).toHaveBeenCalledWith(expect.objectContaining({ template_key: 'import.cleared' }), 1);
  });

  it('refuses a role without the add permission, naming it', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(post(BODY));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.error.message).toContain('/masters/communication-templates');
    expect(createCommunicationTemplate).not.toHaveBeenCalled();
  });

  it('names the field that is wrong', async () => {
    const res = await POST(post({ ...BODY, trigger_key: '' }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toMatch(/Field: choose the field/u);
  });
});
