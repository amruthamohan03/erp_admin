import { NextResponse } from 'next/server';
import { getSession, AuthPayload } from '@/lib/auth';

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

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
