// The border overstay rule: how long a consignment has been sitting at a DRC
// border post, in WORKING days, and whether that is over the agreed allowance.
//
// Measured from DRC Entry to Dispatch from Border — or to today when the file
// has not been dispatched yet, which is the whole point of the screen: an
// operator needs to see a truck that is overstaying NOW, not only after someone
// finally records its departure.
//
// Working days come from `makeWorkingDays`, which the delay-KPI screens already
// use (§4.10). Writing a second counter here is how the KPI screen and this one
// would come to disagree about whether a holiday counted.

import { makeWorkingDays, isValidDateStr } from '@/lib/imkpi/workingDays';

/** The fields of a file this rule reads. Anything else is the caller's. */
export interface BorderFileDates {
  drc_entry_date: string | null;
  dispatch_from_border: string | null;
  /** Once a file reaches the final warehouse it has left the border entirely. */
  warehouse_arrival_date: string | null;
  /** The allowance configured on the entry point (§4.1). */
  border_max_working_days: number | null;
}

export type BorderOutcome =
  /** Within the allowance. */
  | 'on_time'
  /** Over the allowance — still at the border, or dispatched too late. */
  | 'delayed'
  /** No DRC Entry date, so there is nothing to measure from. */
  | 'unmeasured';

export interface BorderDelay {
  outcome: BorderOutcome;
  /** Working days at the border, or null when unmeasured. */
  working_days: number | null;
  /** The allowance applied, so the UI can say "4 of 3" rather than just "4". */
  limit: number;
  /** True while the file is still at the border (measured against today). */
  still_waiting: boolean;
}

/** The allowance to apply when a post carries none — matches the column default. */
export const DEFAULT_BORDER_WORKING_DAYS = 3;

/**
 * Classify one file.
 *
 * `today` is passed in rather than read from the clock so the server, the tests
 * and a later export of the same screen all agree on the open-ended spans; a
 * function that reads `new Date()` internally gives a different answer either
 * side of midnight for no reason the operator can see.
 */
export function classifyBorderDelay(
  file: BorderFileDates,
  holidays: Set<string>,
  today: string,
): BorderDelay {
  const limit = file.border_max_working_days ?? DEFAULT_BORDER_WORKING_DAYS;
  const workingDays = makeWorkingDays(holidays);

  if (!isValidDateStr(file.drc_entry_date)) {
    return { outcome: 'unmeasured', working_days: null, limit, still_waiting: false };
  }

  const dispatched = isValidDateStr(file.dispatch_from_border);
  const stillWaiting = !dispatched;
  // An open span runs to today. A file dispatched long ago still reports the
  // span it actually took, not the span to now — otherwise every historical
  // record drifts into "delayed" as time passes.
  const end = dispatched ? file.dispatch_from_border : today;
  const days = workingDays(file.drc_entry_date, end);

  if (days === null) {
    // Reachable when a dispatch date precedes the entry date, which is a data
    // error rather than a delay — reporting it as 0 days on time would hide it.
    return { outcome: 'unmeasured', working_days: null, limit, still_waiting: stillWaiting };
  }

  return {
    outcome: days > limit ? 'delayed' : 'on_time',
    working_days: days,
    limit,
    still_waiting: stillWaiting,
  };
}

/**
 * True when a file is still AT the border and so belongs on the waiting list.
 *
 * Reaching the final warehouse means the goods are gone even if nobody filled
 * in the dispatch date, so such a file is not overstaying — it is a missing
 * date, which the Briefing tab is for.
 */
export function isAtBorder(file: BorderFileDates): boolean {
  if (isValidDateStr(file.warehouse_arrival_date)) return false;
  return !isValidDateStr(file.dispatch_from_border);
}

export interface BorderTally {
  on_time: number;
  delayed: number;
  unmeasured: number;
  total: number;
}

/** Roll a classified list up into the three figures the screen footers show. */
export function tallyBorderDelays(delays: readonly BorderDelay[]): BorderTally {
  const tally: BorderTally = { on_time: 0, delayed: 0, unmeasured: 0, total: delays.length };
  for (const d of delays) tally[d.outcome] += 1;
  return tally;
}
