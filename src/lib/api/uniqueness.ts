import { fail } from '@/lib/api';

/**
 * Map a Postgres unique-violation (SQLSTATE 23505) into a clear 422 response.
 * Returns `null` if the error isn't a unique violation, so callers can fall
 * through to their generic 500 path.
 *
 * `fieldLabel` is either the one field the table constrains, or a map from
 * CONSTRAINT NAME to label for a table that constrains several. The map matters
 * once a table has more than one unique index: Type of Goods constrains both
 * `goods_type` and `goods_short_name`, and a single label meant a duplicate
 * short name was reported as "That Type is already in use" — naming the wrong
 * field is worse than naming none, because the operator edits the wrong box
 * (§4.23).
 *
 * An unrecognised constraint falls back to the map's `default` entry, so a new
 * index added later degrades to a vague-but-true message rather than to a
 * lookup of `undefined`.
 */
export function uniqueViolationResponse(
  err: unknown,
  fieldLabel: string | Record<string, string>,
) {
  const e = err as { code?: string; constraint?: string } | null;
  if (e?.code !== '23505') return null;

  const label =
    typeof fieldLabel === 'string'
      ? fieldLabel
      : (e.constraint && fieldLabel[e.constraint]) || fieldLabel.default || 'value';

  return fail(`That ${label} is already in use`, 422, {
    field: label,
    code: 'duplicate',
  });
}
