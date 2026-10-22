import type { ErrorCode } from '@/lib/api';

// Typed errors per root CLAUDE.md §6.
// Route handlers throw these; withErrorHandler() in @/lib/api maps them to the
// envelope. The `code` lines up with ErrorCode in @/lib/api so the wire format
// stays consistent.

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: ErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'The request is missing information or is not in the expected form.', details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You are not signed in, or your session has expired. Sign in again to continue.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Your role is not allowed to do this. An administrator can grant it under Mapping → Role to Menu.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The record was not found. It may have been deleted, or the link you followed is out of date.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'This change conflicts with the record as it is now. Reload the page and try again.', details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Some of the values entered are not valid.', details?: Record<string, unknown>) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}
