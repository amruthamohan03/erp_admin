import { fail } from '@/lib/api';

/**
 * Map a Postgres unique-violation (SQLSTATE 23505) into a clear 422 response.
 * Returns `null` if the error isn't a unique violation, so callers can fall
 * through to their generic 500 path.
 */
export function uniqueViolationResponse(err: unknown, fieldLabel: string) {
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') {
    return fail(`That ${fieldLabel} is already in use`, 422, {
      field: fieldLabel,
      code: 'duplicate',
    });
  }
  return null;
}
