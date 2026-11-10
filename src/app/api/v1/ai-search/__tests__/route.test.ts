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
const historyForFollowUp = vi.fn();
const saveAiExchange = vi.fn();

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
vi.mock('@/db/queries/aiConversations', () => ({
  historyForFollowUp: (...a: unknown[]) => historyForFollowUp(...a),
  saveAiExchange: (...a: unknown[]) => saveAiExchange(...a),
}));

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
  saveAiExchange.mockResolvedValue({ id: 5, title: 'status of NMI-IDCOR26-0002' });
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
    expect(runAiSearch).toHaveBeenCalledWith(SESSION, 'status of NMI-IDCOR26-0002', []);
    // A first question starts a conversation, saved with both turns.
    expect(json.data.conversation).toEqual({ id: 5, title: 'status of NMI-IDCOR26-0002' });
    expect(saveAiExchange).toHaveBeenCalledWith(
      1,
      null,
      expect.objectContaining({ role: 'user', content: 'status of NMI-IDCOR26-0002' }),
      expect.objectContaining({ role: 'assistant', content: 'It is **IN TRANSIT**.' }),
    );
    expect(checkPermission).toHaveBeenCalledWith(SESSION, '/ask', 'view');
    expect(recordAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: 'view',
        entityType: 'ai_search',
        entityId: 5,
        metadata: { question: 'status of NMI-IDCOR26-0002', records: ['import:2'] },
      }),
    );
  });

  it('continues one of my conversations, with its earlier turns as context', async () => {
    const history = [
      { role: 'user', content: 'how many import files are in transit?', at: '2026-11-10T08:00:00Z' },
      { role: 'assistant', content: '**3** files.', at: '2026-11-10T08:00:05Z' },
    ];
    historyForFollowUp.mockResolvedValue(history);
    runAiSearch.mockResolvedValue({ answer: 'And **1** export.', figures: [], records: [], steps: [] });
    const res = await POST(post({ question: 'and the export side?', conversation_id: 5 }));
    expect(res.status).toBe(200);
    // Ownership is checked against the CALLER, before the model is asked.
    expect(historyForFollowUp).toHaveBeenCalledWith(1, 5);
    expect(runAiSearch).toHaveBeenCalledWith(SESSION, 'and the export side?', history);
    expect(saveAiExchange).toHaveBeenCalledWith(1, 5, expect.anything(), expect.anything());
  });

  it('never reads or answers into a conversation that is not mine', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    historyForFollowUp.mockRejectedValue(new NotFoundError('Conversation #9 was not found. It may have been deleted — start a new chat.'));
    const res = await POST(post({ question: 'and the export side?', conversation_id: 9 }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error.message).toContain('Conversation #9 was not found');
    expect(runAiSearch).not.toHaveBeenCalled();
    expect(saveAiExchange).not.toHaveBeenCalled();
  });

  it('saves nothing when the answer fails, so the conversation is unchanged', async () => {
    const { AppError } = await import('@/lib/errors');
    runAiSearch.mockRejectedValue(new AppError('AI Search is busy right now (the AI service rate limit was reached) — try again in a minute.', 503, 'INTERNAL_ERROR'));
    const res = await POST(post({ question: 'how many licences expired?' }));
    expect(res.status).toBe(503);
    expect(saveAiExchange).not.toHaveBeenCalled();
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
