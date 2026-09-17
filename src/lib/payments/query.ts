import { paymentFilterSchema } from '@/schemas';
import { defaultPaymentDateRange } from '@/lib/payments/dateRange';

// Turning a URL's query string into something `paymentFilterSchema` can parse.
//
// Shared by the list route and the export route because the two MUST accept the
// same filters: an export of a filtered list has to contain the rows that list
// was showing, and the way that quietly stops being true is one route learning
// a new filter and the other not (§4.10, §4.15).
//
// The awkward part this exists to state once: `searchParams.get()` answers
// `null` for an absent key, and Zod treats an explicit `null` as a value that
// failed the type rather than as "not supplied" — so a schema full of
// `.optional()` fields rejects every request that omits any of them. Every key
// therefore has to become `undefined`, not `null`.

/** The filter keys, taken from the schema so the two cannot fall out of step. */
const FILTER_KEYS = Object.keys(paymentFilterSchema.shape) as Array<
  keyof typeof paymentFilterSchema.shape
>;

/**
 * The filter keys present in `params`, plus any `extra` keys the caller adds
 * (paging, on the list route). Absent keys are omitted so schema defaults apply.
 */
export function paymentQueryInput(
  params: URLSearchParams,
  extra: readonly string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [...FILTER_KEYS, ...extra] as string[]) {
    const value = params.get(key);
    // An empty string is a cleared box, not a filter — a `<SearchableSelect>`
    // with its "All" row selected submits one, and passing it through would make
    // `client_id=` a coercion failure instead of "every client".
    if (value !== null && value !== '') out[key] = value;
  }

  // The default reporting period, applied only when the caller supplied NEITHER
  // bound. One bound alone is a deliberate open-ended range ("everything since
  // March"), so filling in the other would silently contradict what was asked
  // for; and an explicitly cleared range arrives as `all_dates=1` below, which
  // is how "I really do want every year" is said.
  if (!out.from && !out.to && params.get('all_dates') !== '1') {
    const range = defaultPaymentDateRange();
    out.from = range.from;
    out.to = range.to;
  }

  return out;
}

export default paymentQueryInput;
