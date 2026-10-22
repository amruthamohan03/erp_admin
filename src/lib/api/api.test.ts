import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, withErrorHandler } from './index';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';

async function bodyOf(res: NextResponse): Promise<unknown> {
  return await res.json();
}

describe('response envelope (§4.4)', () => {
  it('ok wraps data with ok: true', async () => {
    const res = ok({ id: 1, name: 'x' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ ok: true, data: { id: 1, name: 'x' } });
  });

  it('ok carries meta when provided', async () => {
    const res = ok([1, 2, 3], { meta: { total: 3, page: 1, pageSize: 10 } });
    expect(await bodyOf(res)).toEqual({
      ok: true,
      data: [1, 2, 3],
      meta: { total: 3, page: 1, pageSize: 10 },
    });
  });

  it('fail produces { ok: false, error: { code, message } } with status-derived code', async () => {
    const res = fail('nope', 401);
    expect(res.status).toBe(401);
    expect(await bodyOf(res)).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'nope' },
    });
  });

  it('fail accepts explicit code override via details', async () => {
    const res = fail('weird', 400, { code: 'VALIDATION_ERROR', hint: 'see below' });
    expect(await bodyOf(res)).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'weird', details: { hint: 'see below' } },
    });
  });
});

describe('withErrorHandler (§6)', () => {
  it('passes happy-path responses through unchanged', async () => {
    const handler = withErrorHandler(async () => ok({ done: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ ok: true, data: { done: true } });
  });

  it('maps AppError subclasses to their typed envelope', async () => {
    const handler = withErrorHandler(async () => {
      throw new ConflictError('dup');
    });
    const res = await handler();
    expect(res.status).toBe(409);
    expect(await bodyOf(res)).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: 'dup' },
    });
  });

  it('preserves AppError details', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('bad', { fieldErrors: { email: ['required'] } });
    });
    const res = await handler();
    expect(res.status).toBe(422);
    expect(await bodyOf(res)).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: { fieldErrors: { email: ['required'] } },
      },
    });
  });

  it('maps ZodError to 422 with flattened field errors', async () => {
    const schema = z.object({ email: z.string().email() });
    const handler = withErrorHandler(async () => {
      schema.parse({ email: 'not-an-email' });
      return ok({});
    });
    const res = await handler();
    expect(res.status).toBe(422);
    const body = (await bodyOf(res)) as {
      ok: false;
      error: {
        code: string;
        message: string;
        details: { errors: { fieldErrors: Record<string, unknown> } };
      };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.errors.fieldErrors.email).toBeTruthy();
  });

  it('maps pg unique violation (23505) to 409', async () => {
    const handler = withErrorHandler(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
    const res = await handler();
    expect(res.status).toBe(409);
    expect((await bodyOf(res)) as { error: { code: string } }).toMatchObject({
      error: { code: 'CONFLICT' },
    });
  });

  // §4.39 — a value pointing at a missing record is the operator's to fix, so
  // it is a 422 that names the field, not a bare "Referenced resource not found".
  it('maps pg foreign key violation (23503) to a 422 naming the field', async () => {
    const handler = withErrorHandler(async () => {
      throw Object.assign(new Error('Failed query: insert ...'), {
        cause: {
          code: '23503',
          detail: 'Key (client_id)=(99) is not present in table "client_master_t".',
        },
      });
    });
    const res = await handler();
    expect(res.status).toBe(422);
    expect((await bodyOf(res)) as { error: { code: string; message: string } }).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Client refers to a Client (id 99) that does not exist. Pick another value from the list.',
      },
    });
  });

  it('falls through unknown errors to 500', async () => {
    // Silence console.error for this case so the failure log doesn't leak
    // into the test output. The wrapper logs via console.error, which is fine
    // in production but noisy under test.
    const original = console.error;
    console.error = () => {};
    try {
      const handler = withErrorHandler(async () => {
        throw new Error('something unexpected');
      });
      const res = await handler();
      expect(res.status).toBe(500);
      const body = (await bodyOf(res)) as { error: { code: string; message: string } };
      expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      // §4.39 — the reason and a reference to quote, never a bare "Server error".
      expect(body.error.message).toMatch(/^Unexpected error: something unexpected \(Reference: [0-9a-f]{8}\)$/u);
    } finally {
      console.error = original;
    }
  });

  it('isResponse narrows NextResponse correctly', () => {
    expect(isResponse(ok({}))).toBe(true);
    expect(isResponse(NotFoundError)).toBe(false);
    expect(isResponse(null)).toBe(false);
    expect(isResponse({ ok: true })).toBe(false);
  });
});
