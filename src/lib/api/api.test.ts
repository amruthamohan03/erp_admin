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

  it('maps pg foreign key violation (23503) to 400', async () => {
    const handler = withErrorHandler(async () => {
      throw Object.assign(new Error('fk violation'), { code: '23503' });
    });
    const res = await handler();
    expect(res.status).toBe(400);
    expect((await bodyOf(res)) as { error: { code: string } }).toMatchObject({
      error: { code: 'BAD_REQUEST' },
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
      expect((await bodyOf(res)) as { error: { code: string } }).toMatchObject({
        error: { code: 'INTERNAL_ERROR' },
      });
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
