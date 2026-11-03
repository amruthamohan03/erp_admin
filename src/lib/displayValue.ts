// §4.41 — an empty TEXT value reads "N/A" wherever a person reads it.
//
// Display only. The database keeps an empty value as NULL: storing the text
// 'N/A' would make an unfilled field look filled to every rule that asks
// "is this empty?" — the licence derive that fills only blanks, the required
// check, email / phone validation, unique indexes, the reference generator —
// and an attachment column would hold 'N/A' where a file id belongs.
//
// Dates keep formatDate's em dash (NO_DATE) and numbers keep their own
// rendering: "N/A" is for a value that is words.

export const NO_VALUE = 'N/A';

/** True for null, undefined, and a string that is empty or only whitespace. */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** A text value as it is shown: itself, or "N/A" when there is nothing in it. */
export function displayText(value: unknown, fallback: string = NO_VALUE): string {
  return isBlank(value) ? fallback : String(value);
}

/**
 * Field types whose value is words — the ones an empty value shows "N/A" for.
 * A select shows its option's label, a file its link, so both count.
 */
export const TEXT_FIELD_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textarea',
  'email',
  'tel',
  'select',
  'checkbox-group',
  'file',
  'remark-log',
  'seal-picker',
  'partielle-picker',
  'mca-grid',
]);

/**
 * A field configured with `props.hideWhenEmpty` is not drawn while it holds
 * nothing — the exception to "N/A", for a read-only mirror whose absence is
 * the whole message (Import Tracking's Global License link). Layout only:
 * unlike a visibleWhen, it does not drop the field from the save.
 */
export function hiddenWhileEmpty(props: unknown, value: unknown): boolean {
  const on = !!props && typeof props === 'object' && (props as Record<string, unknown>)['hideWhenEmpty'] === true;
  return on && isBlank(value);
}

/** What an empty value of this field type shows: "N/A" for words, an em dash otherwise. */
export function emptyFor(fieldType: string | null | undefined): string {
  return fieldType && TEXT_FIELD_TYPES.has(fieldType) ? NO_VALUE : '—';
}
