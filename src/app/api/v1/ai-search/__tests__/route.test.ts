import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The session, permission check, AI call and audit are mocked: these tests pin
// the route's contract — who may ask, what it parses, what it answers, that it
// is audited — not the model's answer.
const getSession = vi.fn();
const checkPermission = vi.fn();
const runAiSearch = vi.fn();
const aiSearchConfigured = vi.fn();
const recordAudit = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/permissions')>()),
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));
vi.mock('@/lib/ai/search', () => ({
  AI_SEARCH_RESOURCE: '/ask',
  AI_NOT_CONFIGURED: 'AI Search is not set up on this server.',
  aiSearchConfigured: () => aiSearchConfigured(),
  runAiSearch: (...a: unknown[]) => runAiSearch(...a),
}));
vi.mock('@/lib/audit/recordAudit', () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock('@/lib/db', () => ({ db: {} }));

const { GET, POST } = await import('../route');

const SESSION = { uid: 1, username: 'admin', role_id: 1 };

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/ai-search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  checkPermission.mockResolvedValue(true);
  aiSearchConfigured.mockReturnValue(true);
});

describe('GET /api/v1/ai-search', () => {
  it('says when the server has no API key, with the sentence to show', async () => {
    aiSearchConfigured.mockReturnValue(false);
    const json = await (await GET()).json();
    expect(json.data).toEqual({ configured: false, message: 'AI Search is not set up on this server.' });
  });
});

describe('POST /api/v1/ai-search', () => {
  it('answers a question and audits who asked what', async () => {
    runAiSearch.mockResolvedValue({
      answer: 'It is **IN TRANSIT**.',
      figures: [],
      records: [{ module: 'import', id: 2 }],
      steps: ['Reference "NMI-IDCOR26-0002"'],
    });
    const res = await POST(post({ question: '  status of NMI-IDCOR26-0002  ' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.answer).toBe('It is **IN TRANSIT**.');
    expect(runAiSearch).toHaveBeenCalledWith(SESSION, 'status of NMI-IDCOR26-0002');
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/ask', 'view');
    expect(recordAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: 'view',
        entityType: 'ai_search',
        metadata: { question: 'status of NMI-IDCOR26-0002', records: ['import:2'] },
      }),
    );
  });

  it('rejects a too-short question with a sentence, before calling the model', async () => {
    const res = await POST(post({ question: 'hi' }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.message).toContain('at least 3 characters');
    expect(runAiSearch).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post({ question: 'how many licences expired?' }));
    expect(res.status).toBe(401);
    expect(runAiSearch).not.toHaveBeenCalled();
  });

  it('refuses a role without the /ask menu', async () => {
    checkPermission.mockResolvedValue(false);
    const res = await POST(post({ question: 'how many licences expired?' }));
    expect(res.status).toBe(403);
    expect(runAiSearch).not.toHaveBeenCalled();
  });
});
