// Matching a file's column headings to a module's fields.
//
// Pure — the review screen runs it to pre-fill the mapping, and the tests pin
// the matching rules. Nothing here writes anything; the operator can override
// every suggestion before the import commits.

export interface TargetField {
  name: string;
  label: string;
  /** Scalar types only — a grid or a file field is not importable. */
  type: string;
  required: boolean;
  /** Where a select's options come from, e.g. 'clients'. */
  optionsSource?: string | null;
  optionsLabelField?: string | null;
  /** The accordion that owns the field (page targets) — the save route needs it. */
  accordion?: string;
}

/**
 * A heading reduced to what it MEANS: case, spaces, punctuation and a trailing
 * unit or note dropped, so "Client Name", "client_name" and "CLIENT NAME (short)"
 * are one key.
 */
export function normaliseHeading(raw: string): string {
  return String(raw ?? '')
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/[^A-Za-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

/** How close two headings are, 0–1. Exact match, containment, then word overlap. */
export function headingScore(heading: string, candidate: string): number {
  const a = normaliseHeading(heading);
  const b = normaliseHeading(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.replace(/ /gu, '') === b.replace(/ /gu, '')) return 0.95;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const wordsA = new Set(a.split(' '));
  const wordsB = b.split(' ');
  const shared = wordsB.filter((w) => wordsA.has(w)).length;
  if (shared === 0) return 0;
  return (0.7 * shared) / Math.max(wordsA.size, wordsB.length);
}

/** Anything at or above this is offered as a suggestion; below it, nothing. */
export const MATCH_FLOOR = 0.55;

export interface SuggestOptions {
  /** Aliases taught earlier: normalised heading → field name. Always win. */
  aliases?: Record<string, string>;
}

/**
 * Suggest one field per heading. A field is used once — the best heading for it
 * wins, and a second heading claiming the same field is left unmapped rather
 * than quietly overwriting the first.
 */
export function suggestMapping(
  headings: string[],
  fields: TargetField[],
  { aliases = {} }: SuggestOptions = {},
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const taken = new Set<string>();

  const scored: { heading: string; field: string; score: number }[] = [];
  for (const heading of headings) {
    const alias = aliases[normaliseHeading(heading)];
    if (alias && fields.some((f) => f.name === alias)) {
      scored.push({ heading, field: alias, score: 2 });
      continue;
    }
    for (const field of fields) {
      const score = Math.max(headingScore(heading, field.label), headingScore(heading, field.name));
      if (score >= MATCH_FLOOR) scored.push({ heading, field: field.name, score });
    }
  }
  // Best pairs first, so the strongest heading claims a field.
  scored.sort((a, b) => b.score - a.score);
  for (const { heading, field } of scored) {
    if (result[heading] !== undefined || taken.has(field)) continue;
    result[heading] = field;
    taken.add(field);
  }
  for (const heading of headings) if (result[heading] === undefined) result[heading] = null;
  return result;
}

/** The fields a mapping leaves unfilled that the module will refuse without. */
export function missingRequired(mapping: Record<string, string | null>, fields: TargetField[]): TargetField[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean) as string[]);
  return fields.filter((f) => f.required && !mapped.has(f.name));
}
