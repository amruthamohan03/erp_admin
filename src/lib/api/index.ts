import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession, AuthPayload } from '@/lib/auth';
import { checkPermission, PermissionAction } from '@/lib/auth/permissions';
import { AppError } from '@/lib/errors';

// Response envelope per root CLAUDE.md §4.4.
//   success: { ok: true,  data: T, meta?: {...} }
//   failure: { ok: false, error: { code, message, details? } }

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR';

function codeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    case 422: return 'VALIDATION_ERROR';
    default:  return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

export function ok<T>(data: T, statusOrInit: number | { status?: number; meta?: Record<string, unknown> } = 200) {
  const init = typeof statusOrInit === 'number' ? { status: statusOrInit } : statusOrInit;
  const body: { ok: true; data: T; meta?: Record<string, unknown> } = { ok: true, data };
  if (init.meta) body.meta = init.meta;
  return NextResponse.json(body, { status: init.status ?? 200 });
}

// Backwards-compatible signature: callers still pass (message, status, details?).
// `details` is whatever the caller used to spread at top level (e.g. Zod's flatten()).
// Callers can also pass an explicit { code } in details to override the status-derived code.
export function fail(message: string, status = 400, details?: Record<string, unknown>) {
  const code = (details?.code as ErrorCode | undefined) ?? codeFromStatus(status);
  const cleanedDetails = details && Object.keys(details).filter((k) => k !== 'code').length > 0
    ? Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'code'))
    : undefined;
  const body: { ok: false; error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } = {
    ok: false,
    error: { code, message },
  };
  if (cleanedDetails) body.error.details = cleanedDetails;
  return NextResponse.json(body, { status });
}

export async function requireAuth(): Promise<AuthPayload | NextResponse> {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  return session;
}

// Resource is a menu URL (matches menu_master_t.url, e.g. "/masters/users").
// Returns 401 if unauthenticated, 403 if the role lacks the action, else the
// session. Routes call: `const s = await requirePermission(...); if (isResponse(s)) return s;`
export async function requirePermission(
  resource: string,
  action: PermissionAction,
): Promise<AuthPayload | NextResponse> {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const allowed = await checkPermission(session, resource, action);
  if (!allowed) return fail('Forbidden', 403);
  return session;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

// Maps a thrown value to the envelope. Used by withErrorHandler.
// Handled cases:
//   - AppError subclasses (typed errors from @/lib/errors) → use their status/code/details
//   - ZodError → 422 with flattened field errors under details
//   - pg unique violation (23505) → generic 409
//   - pg foreign key violation (23503) → generic 400
//   - everything else → 500 (logged)
function mapError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return fail(err.message, err.status, { code: err.code, ...(err.details ?? {}) });
  }
  if (err instanceof ZodError) {
    return fail('Invalid input', 422, { errors: err.flatten() });
  }
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505') return fail('Resource already exists', 409);
  if (e?.code === '23503') return fail('Referenced resource not found', 400);
  // eslint-disable-next-line no-console
  console.error('[withErrorHandler]', err);
  return fail('Server error', 500);
}

// Wraps a route handler so it can `throw` typed errors instead of building
// envelope responses by hand. See @/lib/errors for the error classes.
//
//   export const POST = withErrorHandler(async (req) => {
//     const session = await requireAuth();
//     if (isResponse(session)) return session;
//     throw new ConflictError('Username already exists');
//   });
export function withErrorHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (err) {
      return mapError(err);
    }
  };
}
