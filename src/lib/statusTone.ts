// §4.38 — the one place a status decides its colour.
//
// A status is scanned, not read: an operator looking down a Clearing Status
// column wants the cancelled files to jump out in red and the completed ones to
// settle in green before they have read a word. That only works if CANCELLED is
// the same red on the imports list, the licence list and the payments grid —
// which it was not while each screen carried its own badge map (five of them,
// with CANCELLED in cyan on one screen and red on the next).
//
// Pure and dependency-free, so the browser and a server-side builder read the
// same answer.

/** The badge palette. Both themes are stated on every hue (§4.32). */
const BADGE = {
  emerald: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  rose: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  sky: 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  cyan: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  violet: 'bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
  orange: 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
  blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  teal: 'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-500/30',
  fuchsia: 'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-500/30',
  indigo: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  slate: 'bg-muted text-muted-foreground border-border',
} as const;

export type ToneKey = keyof typeof BADGE;

export const TONE_KEYS = Object.keys(BADGE) as ToneKey[];

export const badgeClass = (tone: ToneKey): string => BADGE[tone] ?? BADGE.slate;

/**
 * What each hue MEANS. The meaning is the rule; the words below are only how a
 * status is recognised as having it.
 *
 *   slate   — switched off / not started: Inactive, Disabled, Draft, Closed
 *   rose    — stopped, and will not continue: Cancelled, Rejected, Expired
 *   amber   — waiting on someone: Pending, Awaiting, "… to be validated", "not …"
 *   emerald — finished well: Completed, Cleared, Approved, Paid, Active
 *   cyan    — extended: Prorogated, Renewed
 *   sky     — moving: In Progress, In Transit, Submitted, Under Process
 *   violet  — consumed: Used
 *
 * ORDER MATTERS — first match wins. The switched-off words come before emerald
 * so INACTIVE is not read as ACTIVE; rose and amber come before emerald so
 * "CRF TO BE VALIDATED" is waiting, not validated, and "TO BE PAID" is not paid.
 * Words match whole (\b), so UNPAID never matches PAID.
 */
const RULES: ReadonlyArray<readonly [ToneKey, RegExp]> = [
  ['slate', /\b(INACTIVE|DISABLED?|DRAFT|CLOSED|ARCHIVED|WRITTEN OFF|OFF)\b/u],
  ['rose', /\b(CANCEL\w*|REJECT\w*|EXPIRED?|ANNUL\w*|FAIL\w*|DAMAGED|ERROR|BLOCKED|DELETED|OVERDUE|LOST|REFUSED)\b/u],
  ['amber', /\b(TO BE|NOT|PENDING|AWAIT\w*|WAITING|ON HOLD|HOLD|MODIFIED|AMENDMENT|AMEND\w*|PARTIAL|PARTIELLE|RESUBMIT\w*|UNPAID|DUE|RESTRICTED|TO RECOLLECT)\b/u],
  ['emerald', /\b(COMPLETED?|CLEARED|APPROVED|PAID|ACTIVE|ENABLED|VERIFIED|VALIDATED|DONE|DELIVERED|AVAILABLE|SUCCESS\w*|RECOVERED|READY|RELEASED|APPLIED|YES)\b/u],
  ['cyan', /\b(PROROGAT\w*|EXTENDED|RENEW\w*)\b/u],
  ['sky', /\b(IN PROGRESS|PROGRESS|UNDER PROCESS|PROCESSING|IN TRANSIT|TRANSIT|SUBMITTED|OPEN|NEW|DISPATCH\w*|EXPECTED|ARRIV\w*|HANDED OVER|SENT)\b/u],
  ['violet', /\b(USED)\b/u],
];

/**
 * The hue for a status's text. Unknown text is slate — a status nobody has
 * classified reads as neutral, never as a guess at good or bad.
 */
export function statusTone(status: unknown): ToneKey {
  const text = String(status ?? '').toUpperCase().replace(/[_-]+/gu, ' ').trim();
  if (!text) return 'slate';
  for (const [tone, re] of RULES) if (re.test(text)) return tone;
  return 'slate';
}

/** A Y/N `display` flag as the words a status column shows (§4.27). */
export const displayLabel = (display: unknown): string => (display === 'N' ? 'Disabled' : 'Active');
