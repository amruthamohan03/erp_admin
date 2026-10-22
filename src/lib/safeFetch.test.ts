import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeFetchJson } from './safeFetch';

// This helper is what stands between a failed request and the message the user
// reads. The cases below are the ones that actually bit: an unwrapped route
// handler answering with an empty-bodied 500, which a raw res.json() turns into
// "JSON.parse: unexpected end of data" — a message that names nothing.

function mockFetch(body: string, status = 200, throws?: Error, statusText = ''): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (throws) throw throws;
      return { ok: status >= 200 && status < 300, status, statusText, text: async () => body } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetchJson', () => {
  // §4.39 — each case below must produce a sentence that says what happened.
  it('reports an empty-bodied 500 as a server failure, not a parse error', async () => {
    mockFetch('', 500, undefined, 'Internal Server Error');
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.message).toBe(
      'The server failed while handling the request (HTTP 500 Internal Server Error) and gave no reason. Try again, and report it if it repeats.',
    );
    expect(res.message).not.toContain('JSON.parse');
  });

  it('reports an empty body on a success status as an empty response', async () => {
    mockFetch('', 200, undefined, 'OK');
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('empty response (HTTP 200 OK)');
  });

  it("reports a proxy's HTML error page by its status and title, never its markup", async () => {
    mockFetch('<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>nginx</h1></body></html>', 502, undefined, 'Bad Gateway');
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe(
      'The server is not available right now (HTTP 502 Bad Gateway) — it may be restarting. Wait a moment and try again.',
    );
    expect(res.detail).toBe('502 Bad Gateway');
    expect(res.detail).not.toContain('<');
  });

  it('names an expired session on a bare 401', async () => {
    mockFetch('', 401, undefined, 'Unauthorized');
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe('You are not signed in, or your session has expired. Sign in again to continue.');
  });

  it('surfaces the envelope message on a failure', async () => {
    mockFetch(JSON.stringify({ ok: false, error: { message: 'Required field missing: Client' } }), 422);
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe('Required field missing: Client');
  });

  it('lifts details.field out so a form can mark the input', async () => {
    mockFetch(
      JSON.stringify({ ok: false, error: { message: 'Required field missing', details: { field: 'client_id' } } }),
      422,
    );
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.field).toBe('client_id');
    // A bag holding only the field pointer is not prose — don't print it.
    expect(res.detail).toBeUndefined();
  });

  it('keeps details as prose when it carries more than the field pointer', async () => {
    mockFetch(
      JSON.stringify({ ok: false, error: { message: 'Invalid', details: { field: 'a', invalid: ['X-1'] } } }),
      422,
    );
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.field).toBe('a');
    expect(res.detail).toContain('X-1');
  });

  it('returns the payload on success', async () => {
    mockFetch(JSON.stringify({ ok: true, data: { id: 7 } }), 201);
    const res = await safeFetchJson<{ id: number }>('/x');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.id).toBe(7);
  });

  it('turns a thrown fetch into a network error rather than propagating', async () => {
    mockFetch('', 0, new TypeError('Failed to fetch'));
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe(
      'Could not reach the server — check your network connection, or whether the server is running (Failed to fetch).',
    );
  });
});
