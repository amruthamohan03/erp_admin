import { NextResponse } from 'next/server';
import { getSession, AuthPayload } from './auth';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400, extras?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...extras }, { status });
}

export async function requireAuth(): Promise<AuthPayload | NextResponse> {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  return session;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
