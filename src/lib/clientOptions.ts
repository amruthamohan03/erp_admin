// The single source of truth for how a client is *labelled* in a picker (§4.15).
//
// Clients carry two names: `company_name` (the full legal name, up to 200 chars) and
// `short_name` (the 3-character client code). Every dropdown, filter and picker shows
// the short code — it is what operators say out loud, it is what the reference formats
// embed, and a column of 200-character legal names makes a select unusable.
//
// Six call sites used to spell this out for themselves and two of them drifted onto
// `company_name`. Everything that lists clients for selection now goes through here,
// so the rule holds in one place (§4.10).

import { optionRows } from '@/lib/selectOptions';

/** The column the master-driven page runtime must use for `options_source: 'clients'`. */
export const CLIENT_OPTION_LABEL_FIELD = 'short_name';

export interface ClientOption {
  value: string;
  label: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Label for one client row from GET /api/v1/clients.
 *
 * Takes a loose row so the two option-builder shapes in the app can both call it
 * without a cast. `short_name` is NOT NULL in the schema, so the fallbacks only
 * matter for a partial projection — and showing the full name beats rendering a
 * blank option the user cannot tell apart from its neighbours.
 */
export function clientOptionLabel(row: Record<string, unknown>): string {
  return text(row.short_name) || text(row.company_name) || `#${String(row.id ?? '')}`;
}

/**
 * Fetch clients as ready-to-render select options.
 *
 * NOTE: `pageSize` is capped at 100 by the list-query schema, which *throws* on an
 * over-cap value (422 → an empty dropdown). Raising it here requires raising the
 * endpoint cap too. See the TODO(dropdown) in FieldRenderer about moving large
 * entities onto a server-side searchable select.
 */
export async function fetchClientOptions(): Promise<ClientOption[]> {
  // Envelope handling is shared (§4.10); only the labelling rule is ours. Order
  // is SearchableSelect's — options render by id (§4.16), so nothing sorts here.
  const res = await fetch('/api/v1/clients?pageSize=100');
  return optionRows(await res.json()).map((row) => ({
    value: String(row.id),
    label: clientOptionLabel(row),
  }));
}
