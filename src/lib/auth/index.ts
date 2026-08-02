import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'auth_token';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-me',
);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthPayload extends JWTPayload {
  uid: number;
  username: string;
  role_id: number;
  role_name?: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// A `secure` cookie is discarded by the browser over plain HTTP, and the login
// POST still returns 200 — so the symptom is "credentials accepted, still
// bounced back to /login". Tying that flag to NODE_ENV alone breaks any
// deployment that serves a production build without TLS in front of it (a
// staging box reached by IP, say). AUTH_COOKIE_SECURE overrides it; read at
// call time so the process environment is what decides, not import order.
function secureCookieEnabled(): boolean {
  const override = process.env.AUTH_COOKIE_SECURE;
  if (override) return override === 'true';
  return process.env.NODE_ENV === 'production';
}

export async function setAuthCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookieEnabled(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
