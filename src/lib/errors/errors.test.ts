import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './index';

describe('typed errors', () => {
  it('AppError carries status/code/details and stays an Error', () => {
    const err = new AppError('boom', 418, 'BAD_REQUEST', { teapot: true });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(err.status).toBe(418);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.details).toEqual({ teapot: true });
  });

  it('subclass status/code defaults match HTTP semantics', () => {
    const cases = [
      { ctor: BadRequestError, status: 400, code: 'BAD_REQUEST' },
      { ctor: UnauthorizedError, status: 401, code: 'UNAUTHORIZED' },
      { ctor: ForbiddenError, status: 403, code: 'FORBIDDEN' },
      { ctor: NotFoundError, status: 404, code: 'NOT_FOUND' },
      { ctor: ConflictError, status: 409, code: 'CONFLICT' },
      { ctor: ValidationError, status: 422, code: 'VALIDATION_ERROR' },
    ] as const;
    for (const { ctor, status, code } of cases) {
      const err = new ctor();
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
    }
  });

  it('ConflictError + ValidationError carry details', () => {
    const conflict = new ConflictError('dup', { field: 'email' });
    expect(conflict.details).toEqual({ field: 'email' });

    const validation = new ValidationError('bad', { fieldErrors: { x: ['required'] } });
    expect(validation.details).toEqual({ fieldErrors: { x: ['required'] } });
  });
});
