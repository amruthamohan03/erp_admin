import { describe, it, expect } from 'vitest';
import { redact } from './redact';

// recordAudit is DB-bound and stays integration territory; redact is pure and
// covers the security-critical part (sensitive fields never reach audit_log_t
// snapshots).

describe('redact', () => {
  it('returns primitives unchanged', () => {
    expect(redact(42)).toBe(42);
    expect(redact('hi')).toBe('hi');
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('redacts the canonical password key', () => {
    expect(redact({ password: 'hunter2' })).toEqual({
      password: '[REDACTED]',
    });
  });

  it('redacts known sensitive keys (case-insensitive)', () => {
    expect(
      redact({
        Password: 'p',
        ACCESS_TOKEN: 't',
        Secret: 's',
        api_key: 'k',
        private_key: 'pk',
      }),
    ).toEqual({
      Password: '[REDACTED]',
      ACCESS_TOKEN: '[REDACTED]',
      Secret: '[REDACTED]',
      api_key: '[REDACTED]',
      private_key: '[REDACTED]',
    });
  });

  it('leaves unrelated keys alone', () => {
    expect(redact({ email: 'a@b.c', name: 'Jane' })).toEqual({
      email: 'a@b.c',
      name: 'Jane',
    });
  });

  it('recurses into nested objects', () => {
    expect(
      redact({
        user: {
          email: 'a@b.c',
          credentials: { password: 'pw', token: 'tk' },
        },
      }),
    ).toEqual({
      user: {
        email: 'a@b.c',
        credentials: { password: '[REDACTED]', token: '[REDACTED]' },
      },
    });
  });

  it('recurses into arrays', () => {
    expect(
      redact([
        { name: 'a', password: '1' },
        { name: 'b', secret: '2' },
      ]),
    ).toEqual([
      { name: 'a', password: '[REDACTED]' },
      { name: 'b', secret: '[REDACTED]' },
    ]);
  });

  it('handles nested arrays inside objects', () => {
    expect(
      redact({
        users: [{ password: 'a' }, { password: 'b' }],
      }),
    ).toEqual({
      users: [{ password: '[REDACTED]' }, { password: '[REDACTED]' }],
    });
  });

  it('does not mutate the source object', () => {
    const src = { password: 'p', name: 'Jane' };
    redact(src);
    expect(src).toEqual({ password: 'p', name: 'Jane' });
  });

  it('preserves the marker as a constant string', () => {
    const result = redact({ password: 'a' }) as { password: string };
    expect(result.password).toBe('[REDACTED]');
  });
});
