import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, permission check, queries and audit are mocked: these tests pin
// that every conversation route is gated on /ask and always passes the CALLER's
// own user id — never one taken from the request — to the owner-scoped queries.
const getSession = vi.fn();
const checkPermission = vi.fn();
const listAiConversations = vi.fn();
const getAiConversation = vi.fn();
const deleteAiConversation = vi.fn();
const recordAudit = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/lib/ai/search', () => ({ AI_SEARCH_RESOURCE: '/ask' }));
vi.mock('@/db/queries/aiConversations', () => ({
  listAiConversations: (...a: unknown[]) => listAiConversations(...a),
  getAiConversation: (...a: unknown[]) => getAiConversation(...a),
  deleteAiConversation: (...a: unknown[]) => deleteAiConversation(...a),
}));
vi.mock('@/lib/audit/recordAudit', () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock('@/lib/db', () => ({ db: {} }));

const list = await import('../conversations/route');
const one = await import('../conversations/[id]/route');

const SESSION = { uid: 7, username: 'operator', role_id: 3 };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
});

describe('GET /api/v1/ai-search/conversations', () => {
  it('lists only my chats, searched by title', async () => {
    listAiConversations.mockResolvedValue([{ id: 3, title: 'Licences expiring', updated_at: '2026-11-10T08:00:00Z', turns: 4 }]);
    const res = await list.GET(new NextRequest('http://localhost/api/v1/ai-search/conversations?q=licen'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(listAiConversations).toHaveBeenCalledWith(7, 'licen');
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/ask', 'view');
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await list.GET(new NextRequest('http://localhost/api/v1/ai-search/conversations'));
    expect(res.status).toBe(401);
    expect(listAiConversations).not.toHaveBeenCalled();
  });

  it('refuses a role without the /ask menu', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await list.GET(new NextRequest('http://localhost/api/v1/ai-search/conversations'));
    expect(res.status).toBe(403);
  });
});

describe('/api/v1/ai-search/conversations/{id}', () => {
  it('opens one of my chats by my user id', async () => {
    getAiConversation.mockResolvedValue({ id: 3, title: 'x', messages: [], updated_at: '2026-11-10T08:00:00Z' });
    const res = await one.GET(new NextRequest('http://localhost/x'), ctx('3'));
    expect(res.status).toBe(200);
    expect(getAiConversation).toHaveBeenCalledWith(7, 3);
  });

  it('says plainly when the number is not a conversation number', async () => {
    const res = await one.GET(new NextRequest('http://localhost/x'), ctx('abc'));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.message).toContain('"abc" is not a valid conversation number');
    expect(getAiConversation).not.toHaveBeenCalled();
  });

  it('deletes one of my chats and audits it', async () => {
    deleteAiConversation.mockResolvedValue({ id: 3, title: 'Licences expiring' });
    const res = await one.DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctx('3'));
    expect(res.status).toBe(200);
    expect(deleteAiConversation).toHaveBeenCalledWith(7, 3);
    expect(recordAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: 'delete', entityType: 'ai_conversation', entityId: 3 }),
    );
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await one.DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctx('3'));
    expect(res.status).toBe(401);
    expect(deleteAiConversation).not.toHaveBeenCalled();
  });
});
