// Fetching a master endpoint as dropdown options (§4.10 — one implementation).
//
// Three list pages carried a byte-identical `fetchOptions` helper, and a fourth
// copy sat in clientOptions.ts. They drifted: two handled the paginated
// `{ data: { items } }` envelope and two did not, so the same dropdown was
// populated on one screen and empty on another.
//
// Ordering is deliberately NOT done here. SearchableSelect owns it (§4.16), so
// there is exactly one answer to "what order does a dropdown render in" no
// matter how the options were obtained.

export interface MasterOption {
  id: number;
  label: string;
}

/** What a dropdown renders: the stored value and the text the user reads. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * §4.16 — options render in **id order**, not alphabetically.
 *
 * An entity-backed dropdown carries the row id as its `value`, so ascending id
 * is the order the records were created in — which is the order operators
 * already know a master by, and the order the master's own screen lists it in.
 * Alphabetical order shuffled that: adding a client called "AAA" moved every
 * other option down, so a picker an operator had learned by position changed
 * under them for reasons that had nothing to do with their work.
 *
 * When the values are not ids (status codes, 'Y'/'N', workflow stages) there is
 * no id to sort by, so the supplied order is kept exactly. That order is
 * authored — usually a meaningful sequence — and alphabetising it was destroying
 * information rather than adding any.
 *
 * Decided once per list rather than per comparison: a comparator that sorts some
 * pairs and not others is inconsistent, and the result of an inconsistent
 * comparator is not defined.
 */
export function orderOptions<T extends SelectOption>(options: T[]): T[] {
  const byId = options.every((o) => o.value !== '' && Number.isFinite(Number(o.value)));
  if (!byId) return options;
  return options.slice().sort((a, b) => Number(a.value) - Number(b.value));
}

// The list-query Zod schemas cap pageSize at 100 and *throw* above it, which
// surfaces as a 422 and an empty dropdown. Raising this requires raising the
// endpoint caps first.
const OPTIONS_PAGE_SIZE = 100;

/** Rows out of either envelope shape: a flat `data` array, or `data.items`. */
export function optionRows(json: unknown): Array<Record<string, unknown>> {
  const body = json as { ok?: boolean; data?: unknown };
  if (!body?.ok) return [];
  const data = body.data;
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const items = (data as { items?: unknown })?.items;
  return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

/**
 * The first of `keys` that the row actually carries, else the id.
 *
 * Several masters have an optional short code alongside a required name —
 * `unit_master_t.unit_code` beside `unit_name` is the live case — and asking for
 * the code alone is a trap: when the column is null for EVERY row, the id
 * fallback turns the whole dropdown into a list of bare numbers. That is what
 * the quotation grid's Unit picker did, and it is the failure the id fallback
 * was supposed to prevent rather than cause.
 *
 * So the preferred label comes first and the guaranteed one second. The id
 * remains the last resort — an option with no label at all is indistinguishable
 * from its neighbours — but reaching it now means the row has nothing to show,
 * which is a data problem worth seeing rather than a shape the caller asked for.
 */
export function labelOf(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return String(row.id);
}

/**
 * Fetch `/api/v1/{source}` and project each row to `{ id, label }`.
 *
 * `labelKey` may be one field or an ordered list of candidates — see `labelOf`
 * for why a master with an optional code wants the list form.
 *
 * Returns [] on failure. A dropdown that cannot load is a data problem for the
 * page to surface, not a reason to throw through a filter bar's render.
 */
export async function fetchMasterOptions(
  source: string,
  labelKey: string | readonly string[],
): Promise<MasterOption[]> {
  const keys = typeof labelKey === 'string' ? [labelKey] : labelKey;
  try {
    const sep = source.includes('?') ? '&' : '?';
    const res = await fetch(`/api/v1/${source}${sep}pageSize=${OPTIONS_PAGE_SIZE}`);
    return optionRows(await res.json()).map((row) => ({
      id: row.id as number,
      label: labelOf(row, keys),
    }));
  } catch {
    return [];
  }
}
