// Dashboard data-source resolution. Ported from origin/main's clients
// dashboard (commit b34698d) and generalized for any dashboard card.
//
// data_source format: '<endpoint>#<dot.separated.json.path>'. The path is
// optional — a bare endpoint falls back to the legacy heuristic (try
// value → total → count → array length) so existing seeded cards keep
// working without re-seeding.
//
// Why a json-path:
//   * One endpoint can feed many cards. /api/v1/clients/stats can
//     return { total: 100, active: 80, this_month: 5 } and three
//     separate cards point at #total, #active, #this_month.
//   * Avoids ambiguity when a payload has multiple plausible numbers
//     (e.g. both `total` and `count`).
//   * The endpoint is fetched once per distinct value (see helpers in
//     this file) so card-heavy dashboards stay cheap.

export interface ParsedDataSource {
  endpoint: string;
  path: string;
}

/**
 * Split a card's data_source into endpoint + path. Returns null when the
 * input is empty so the caller can treat "no source" uniformly. A bare
 * endpoint (no `#`) returns path=''.
 */
export function parseDataSource(
  src: string | null | undefined,
): ParsedDataSource | null {
  if (!src) return null;
  const hash = src.indexOf('#');
  if (hash === -1) return { endpoint: src, path: '' };
  return { endpoint: src.slice(0, hash), path: src.slice(hash + 1) };
}

/**
 * Walk a dot-separated path through a JSON value. Returns undefined on the
 * first unresolved segment so the caller can render a placeholder. An empty
 * path returns the whole value (lets resolveCardValue fall through to the
 * heuristic without special-casing).
 */
export function resolveJsonPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (
      acc &&
      typeof acc === 'object' &&
      key in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Legacy heuristic. Used when a card's data_source has no explicit `#path`.
 * Preserves backward compat with cards seeded before path resolution
 * landed — try the obvious numeric envelopes in turn:
 *   number             → itself
 *   { value }          → value
 *   { total }          → total
 *   { count }          → count
 *   array              → length
 *   anything else      → null
 */
export function heuristicValue(data: unknown): unknown {
  if (typeof data === 'number') return data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if ('value' in obj) return obj.value;
    if ('total' in obj) return obj.total;
    if ('count' in obj) return obj.count;
  }
  if (Array.isArray(data)) return data.length;
  return null;
}

/**
 * Resolve a card's display value. Prefer the explicit json-path when one
 * was provided; otherwise fall back to the legacy heuristic.
 */
export function resolveCardValue(data: unknown, path: string): unknown {
  if (path) return resolveJsonPath(data, path);
  return heuristicValue(data);
}

/**
 * Collect the distinct endpoints referenced by a batch of cards. Used by
 * the dashboard page to fetch each endpoint once, regardless of how many
 * cards consume it via different `#path` suffixes.
 */
export function distinctEndpoints<T extends { data_source: string | null }>(
  cards: ReadonlyArray<T>,
): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    const parsed = parseDataSource(c.data_source);
    if (parsed) set.add(parsed.endpoint);
  }
  return Array.from(set);
}
