// The `status_filters` URL parameter, read back into the list's card selection.
//
// §4.29 requires a KPI to be reachable: clicking a tile has to filter the list
// to exactly the rows it counted. The tracking lists already SEND this parameter
// when cards are toggled, but nothing read it back — so a link from a dashboard
// landed on an unfiltered grid showing every file, which is worse than no link
// at all because the number and the list then disagree in front of the operator.
//
// Shared because the import and export lists need byte-identical behaviour, and
// a second copy is how the two would drift (§4.10).

/**
 * The valid, de-duplicated filter keys in a `status_filters` value.
 *
 * Unknown keys are dropped rather than passed through: the value comes from a
 * URL anyone can edit, and forwarding an unrecognised key to the endpoint would
 * either error or — worse — be ignored, leaving a list that claims to be
 * filtered and is not.
 */
export function statusFiltersFromParam(
  raw: string | null | undefined,
  isKnownKey: (key: string) => boolean,
): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key && isKnownKey(key)) seen.add(key);
  }
  return [...seen];
}
