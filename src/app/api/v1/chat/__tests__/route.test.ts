import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, the permission check and the queries are mocked: these tests pin
// each route's contract — who may call it, what it parses, what it answers.
const getSession = vi.fn();
const checkPermission = vi.fn();
const listChatContacts = vi.fn();
const chatUnreadCount = vi.fn();
const chatThread = vi.fn();
const sendChatMessage = vi.fn();
const touchChatPresence = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/db/queries/chat', () => ({
  CHAT_RESOURCE: '/chat',
  listChatContacts: (...a: unknown[]) => listChatContacts(...a),
  chatUnreadCount: (...a: unknown[]) => chatUnreadCount(...a),
  chatThread: (...a: unknown[]) => chatThread(...a),
  sendChatMessage: (...a: unknown[]) => sendChatMessage(...a),
  touchChatPresence: (...a: unknown[]) => touchChatPresence(...a),
}));

const contacts = await import('../contacts/route');
const unread = await import('../unread-count/route');
const messages = await import('../messages/route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/chat/messages', {
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

describe('GET /api/v1/chat/contacts', () => {
  it('lists the contacts and says whether the caller may send', async () => {
    listChatContacts.mockResolvedValue([{ user_id: 2, full_name: 'General Manager', unread: 1 }]);
    checkPermission.mockImplementation(async (_s, _r, action) => action === 'view');
    const res = await contacts.GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ user_id: 2, full_name: 'General Manager', unread: 1 }]);
    expect(json.meta).toEqual({ can_send: false });
    expect(listChatContacts).toHaveBeenCalledWith(1);
    expect(touchChatPresence).toHaveBeenCalledWith(1);
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await contacts.GET();
    expect(res.status).toBe(401);
    expect(listChatContacts).not.toHaveBeenCalled();
    expect(touchChatPresence).not.toHaveBeenCalled();
  });

  it('refuses a role without the /chat menu', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await contacts.GET();
    expect(res.status).toBe(403);
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/chat', 'view');
  });
});

describe('GET /api/v1/chat/unread-count', () => {
  it('returns the caller’s unread count', async () => {
    chatUnreadCount.mockResolvedValue(3);
    const json = await (await unread.GET()).json();
    expect(json).toEqual({ ok: true, data: { unread: 3 } });
    // The badge poll is the presence heartbeat on every screen.
    expect(touchChatPresence).toHaveBeenCalledWith(1);
  });
});

describe('/api/v1/chat/messages', () => {
  it('reads one conversation, only past `after` when given', async () => {
    chatThread.mockResolvedValue([]);
    const res = await messages.GET(new NextRequest('http://localhost/api/v1/chat/messages?with=2&after=10'));
    expect(res.status).toBe(200);
    expect(chatThread).toHaveBeenCalledWith(1, 2, 10);
  });

  it('names the missing contact rather than failing anonymously', async () => {
    const res = await messages.GET(new NextRequest('http://localhost/api/v1/chat/messages'));
    expect(res.status).toBe(422);
    expect(chatThread).not.toHaveBeenCalled();
  });

  it('sends a trimmed message, gated on add', async () => {
    sendChatMessage.mockResolvedValue({ id: 5 });
    const res = await messages.POST(post({ to: 2, body: '  hello  ' }));
    expect(res.status).toBe(201);
    expect(sendChatMessage).toHaveBeenCalledWith(1, 2, 'hello');
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/chat', 'add');
  });

  it('rejects an empty message with a sentence', async () => {
    const res = await messages.POST(post({ to: 2, body: '   ' }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('Message is required');
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('refuses a signed-out sender', async () => {
    getSession.mockResolvedValue(null);
    const res = await messages.POST(post({ to: 2, body: 'hi' }));
    expect(res.status).toBe(401);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });
});
