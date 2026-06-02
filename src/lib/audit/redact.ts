// §4.10 — fields scrubbed from `before` / `after` snapshots before they're
// persisted to audit_log. Add new sensitive fields here. The check is name-only
// (case-insensitive) so adding `password` covers `password`, `Password`, etc.

const REDACTED_FIELDS = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'private_key',
]);

const REDACTED_MARKER = '[REDACTED]' as const;

export function redact<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v)) as unknown as T;
  }
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(k.toLowerCase())) {
      out[k] = REDACTED_MARKER;
    } else {
      out[k] = redact(v);
    }
  }
  return out as unknown as T;
}
