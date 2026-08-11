import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeFetchJson } from './safeFetch';

// This helper is what stands between a failed request and the message the user
// reads. The cases below are the ones that actually bit: an unwrapped route
// handler answering with an empty-bodied 500, which a raw res.json() turns into
// "JSON.parse: unexpected end of data" — a message that names nothing.

function mockFetch(body: string, status = 200, throws?: Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (throws) throw throws;
      return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetchJson', () => {
  it('reports an empty body as an empty response, not a parse error', async () => {
    mockFetch('', 500);
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.message).toContain('Empty response');
    expect(res.message).not.toContain('JSON.parse');
  });

  it('reports a non-JSON body with a snippet of what came back', async () => {
    mockFetch('<!DOCTYPE html><h1>Internal Server Error</h1>', 500);
    const res = await safeFetchJson('/x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe('Server returned non-JSON response');
    expect(res.detail).toContain('DOCTYPE');
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
    expect(res.message).toBe('Network error');
  });
});
