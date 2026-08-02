import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setAuthCookie,
  type AuthPayload,
} from './index';

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

const samplePayload: AuthPayload = {
  uid: 42,
  username: 'tester',
  role_id: 1,
  role_name: 'admin',
};

describe('password hashing (bcrypt)', () => {
  it('hash + verify round-trip succeeds', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash.length).toBeGreaterThan(20);
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('verify fails for the wrong password', async () => {
    const hash = await hashPassword('one-secret');
    await expect(verifyPassword('different-secret', hash)).resolves.toBe(false);
  });

  it('two hashes of the same password differ (salt randomness)', async () => {
    const a = await hashPassword('same-input');
    const b = await hashPassword('same-input');
    expect(a).not.toBe(b);
    // but both verify
    await expect(verifyPassword('same-input', a)).resolves.toBe(true);
    await expect(verifyPassword('same-input', b)).resolves.toBe(true);
  });
});

describe('JWT sign / verify (jose)', () => {
  it('round-trips a payload', async () => {
    const token = await signToken(samplePayload);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.sig

    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.uid).toBe(samplePayload.uid);
    expect(decoded?.username).toBe(samplePayload.username);
    expect(decoded?.role_id).toBe(samplePayload.role_id);
    expect(decoded?.role_name).toBe(samplePayload.role_name);
  });

  it('verify returns null for a malformed token', async () => {
    await expect(verifyToken('definitely-not-a-jwt')).resolves.toBeNull();
  });

  it('verify returns null when a token is signed with a different secret', async () => {
    // Forge a JWT signed under a foreign secret. verifyToken should reject it
    // because the signature won't match the module's JWT_SECRET.
    const { SignJWT } = await import('jose');
    const foreignSecret = new TextEncoder().encode('some-other-secret-totally-different');
    const foreignToken = await new SignJWT({ ...samplePayload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(foreignSecret);

    await expect(verifyToken(foreignToken)).resolves.toBeNull();
  });

  it('payload carries iat (issued-at) so token freshness is checkable', async () => {
    const token = await signToken(samplePayload);
    const decoded = await verifyToken(token);
    expect(decoded?.iat).toBeTypeOf('number');
    // iat should be within a few seconds of now
    const now = Math.floor(Date.now() / 1000);
    expect(decoded!.iat!).toBeGreaterThan(now - 5);
    expect(decoded!.iat!).toBeLessThanOrEqual(now + 1);
  });
});

// The `secure` flag decides whether a browser will keep the cookie at all: it
// is dropped over plain HTTP, which presents as "login succeeds, user lands
// back on /login". Staging serves a production build without TLS, so the flag
// has to be overridable rather than inferred from NODE_ENV alone.
describe('auth cookie `secure` flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cookieStore.set.mockClear();
  });

  const secureFlagAfterLogin = async (): Promise<boolean | undefined> => {
    await setAuthCookie('a.b.c');
    return cookieStore.set.mock.calls[0]?.[2]?.secure;
  };

  it('defaults to secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_COOKIE_SECURE', '');
    await expect(secureFlagAfterLogin()).resolves.toBe(true);
  });

  it('defaults to insecure outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_COOKIE_SECURE', '');
    await expect(secureFlagAfterLogin()).resolves.toBe(false);
  });

  it('AUTH_COOKIE_SECURE=false wins in production (plain-HTTP staging)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    await expect(secureFlagAfterLogin()).resolves.toBe(false);
  });

  it('AUTH_COOKIE_SECURE=true wins outside production (TLS in front)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'true');
    await expect(secureFlagAfterLogin()).resolves.toBe(true);
  });
});
