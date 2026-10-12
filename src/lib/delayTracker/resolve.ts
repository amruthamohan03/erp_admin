// The Delay Tracker's arithmetic: how long a file has taken, how long it has
// left, and whether that is late.
//
// Pure and separate from the queries so the parts that can actually be wrong —
// counting a deadline across a weekend, ageing a finished file to today, a
// span measured backwards — are unit-tested without a database.
//
// Working days reuse `makeWorkingDays`, which the Delay KPI screens and the
// border overstay rule already use (§4.10). Writing a second counter here is
// how this screen and those would come to disagree about whether a holiday
// counted.

import { makeWorkingDays, isValidDateStr } from '@/lib/imkpi/workingDays';
import type { DayBasis } from '@/db/schema/delayRuleMaster';

export type { DayBasis };

/** One sub-period of a rule, as the tracker needs it. */
export interface DelayStage {
  key: string;
  label: string;
  short: string;
  from: string;
  to: string;
  target: number;
  priority: boolean;
  color: string;
  icon: string;
}

/** A process: where it starts, where it finishes, and how long it may take. */
export interface DelayRule {
  id: number;
  key: string;
  module: 'import' | 'export';
  name: string;
  /** Master letter this rule is for, or null for the module's default. */
  transportLetter: string | null;
  startField: string;
  endField: string;
  targetDays: number;
  dayBasis: DayBasis;
  /** Days-remaining marks that raise a notification, largest first. */
  notifyDaysBefore: number[];
  notifyOverdue: boolean;
  stages: DelayStage[];
}

export type DelayStatus =
  /** No start date, so the clock has not begun. */
  | 'not_started'
  /** Running, inside the allowance and not near the end of it. */
  | 'on_track'
  /** Running, with the allowance nearly spent — the warning band. */
  | 'due_soon'
  /** Running, past the allowance. */
  | 'overdue'
  | 'completed_on_time'
  | 'completed_late';

export interface StageOutcome {
  key: string;
  label: string;
  short: string;
  target: number;
  color: string;
  icon: string;
  priority: boolean;
  from_date: string | null;
  to_date: string | null;
  /** Days taken, or days so far when the leg is still open. */
  days: number | null;
  /** True while the leg has started and not finished. */
  pending: boolean;
  /** Null when the leg cannot be measured at all. */
  over_by: number | null;
  status: DelayStatus;
}

export interface DelayOutcome {
  rule_key: string;
  rule_name: string;
  basis: DayBasis;
  target_days: number;
  start_date: string | null;
  end_date: string | null;
  /** The date the allowance runs out, in the rule's own basis. */
  due_date: string | null;
  /** Days from the start to the finish, or to today while running. */
  elapsed_days: number | null;
  /** Allowance minus elapsed. Negative means over. Null when unmeasurable. */
  remaining_days: number | null;
  status: DelayStatus;
  stages: StageOutcome[];
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` for a UTC timestamp. */
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Calendar days from `from` (exclusive) to `to` (inclusive), or null. */
export function calendarSpan(from: string | null, to: string | null): number | null {
  if (!isValidDateStr(from) || !isValidDateStr(to)) return null;
  const f = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t) || t < f) return null;
  return Math.floor((t - f) / DAY_MS);
}

/**
 * The date `n` days after `from`, in the given basis.
 *
 * The inverse of the span counters, and the reason it needs its own function:
 * a three-working-day allowance starting on a Thursday is due the following
 * Tuesday, which no amount of adding three to a date will produce.
 */
export function addDays(
  from: string,
  n: number,
  basis: DayBasis,
  holidays: Set<string>,
): string | null {
  if (!isValidDateStr(from)) return null;
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  if (basis === 'calendar') return iso(start + n * DAY_MS);

  let remaining = n;
  let cursor = start;
  // A zero-day allowance is due on the start date itself — the work must be
  // done the same day, not by the next working day.
  // Bounded so a bad configuration cannot spin: 3650 days is the column's cap,
  // and even all-holiday years cannot need more than a few times that.
  let guard = 0;
  while (remaining > 0 && guard < 20_000) {
    cursor += DAY_MS;
    guard += 1;
    const day = new Date(cursor);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(iso(cursor))) continue;
    remaining -= 1;
  }
  return iso(cursor);
}

/** The span between two dates in the rule's basis. */
function span(
  from: string | null,
  to: string | null,
  basis: DayBasis,
  holidays: Set<string>,
): number | null {
  return basis === 'calendar' ? calendarSpan(from, to) : makeWorkingDays(holidays)(from, to);
}

/**
 * How late a span is, as a status.
 *
 * `warnAt` is the widest notification mark, so the amber band on screen begins
 * exactly when the first notification would be raised — an operator should not
 * be able to see "on track" on a file that has already been warned about.
 */
function classify(
  remaining: number | null,
  finished: boolean,
  warnAt: number,
): DelayStatus {
  if (remaining === null) return finished ? 'completed_on_time' : 'not_started';
  if (finished) return remaining < 0 ? 'completed_late' : 'completed_on_time';
  if (remaining < 0) return 'overdue';
  return remaining <= warnAt ? 'due_soon' : 'on_track';
}

/** The widest mark a rule warns at, and so where "due soon" begins. */
export function warnThreshold(rule: DelayRule): number {
  const marks = rule.notifyDaysBefore.filter((n) => Number.isFinite(n) && n >= 0);
  return marks.length > 0 ? Math.max(...marks) : 0;
}

/**
 * Measure one file against one rule.
 *
 * `today` is passed in rather than read from the clock so the screen, the
 * export and the notification sweep all agree on the open-ended spans; a
 * function reading `new Date()` internally gives a different answer either side
 * of midnight for no reason the operator can see.
 */
export function resolveDelay(
  file: Record<string, unknown>,
  rule: DelayRule,
  holidays: Set<string>,
  today: string,
): DelayOutcome {
  const dateOf = (field: string): string | null => {
    const v = file[field];
    return typeof v === 'string' && isValidDateStr(v) ? v.slice(0, 10) : null;
  };

  const startDate = dateOf(rule.startField);
  const endDate = dateOf(rule.endField);
  const finished = endDate !== null;

  // A finished file is measured to its OWN end date, never to today: a file
  // that took nineteen days took nineteen days, and ageing it forever would
  // drift every historical record into "overdue" as time passes.
  const measureTo = finished ? endDate : today;
  const elapsed = startDate === null ? null : span(startDate, measureTo, rule.dayBasis, holidays);
  const remaining = elapsed === null ? null : rule.targetDays - elapsed;
  const dueDate =
    startDate === null ? null : addDays(startDate, rule.targetDays, rule.dayBasis, holidays);

  const warnAt = warnThreshold(rule);

  const stages: StageOutcome[] = rule.stages.map((s) => {
    const from = dateOf(s.from);
    const to = dateOf(s.to);
    const legFinished = to !== null;
    const legTo = legFinished ? to : today;
    const days = from === null ? null : span(from, legTo, rule.dayBasis, holidays);
    return {
      key: s.key,
      label: s.label,
      short: s.short,
      target: s.target,
      color: s.color,
      icon: s.icon,
      priority: s.priority,
      from_date: from,
      to_date: to,
      days,
      pending: from !== null && !legFinished,
      over_by: days === null ? null : days - s.target,
      // A leg warns at one day left regardless of the rule's marks: the marks
      // are about the whole process, and a two-day leg has no room for a
      // five-day warning.
      status: classify(days === null ? null : s.target - days, legFinished, 1),
    };
  });

  return {
    rule_key: rule.key,
    rule_name: rule.name,
    basis: rule.dayBasis,
    target_days: rule.targetDays,
    start_date: startDate,
    end_date: endDate,
    due_date: dueDate,
    elapsed_days: elapsed,
    remaining_days: remaining,
    status: classify(remaining, finished, warnAt),
    stages,
  };
}

/**
 * Which notification mark this file has just crossed, or null for none.
 *
 * Returns the TIGHTEST mark at or above the days remaining, so a file that
 * jumps from six days left to two raises the three-day warning rather than
 * silently skipping it — the sweep records what it has said, so the five-day
 * one is simply never given.
 */
export function dueMark(outcome: DelayOutcome, rule: DelayRule): number | null {
  if (outcome.status === 'overdue') return rule.notifyOverdue ? -1 : null;
  if (outcome.status !== 'due_soon' || outcome.remaining_days === null) return null;
  const hit = rule.notifyDaysBefore
    .filter((n) => Number.isFinite(n) && n >= outcome.remaining_days!)
    .sort((a, b) => a - b);
  return hit.length > 0 ? hit[0] : null;
}

/** The counts the tracker's summary cards show. */
export interface DelayTally {
  total: number;
  not_started: number;
  on_track: number;
  due_soon: number;
  overdue: number;
  completed_on_time: number;
  completed_late: number;
}

export function tallyDelays(outcomes: ReadonlyArray<DelayOutcome>): DelayTally {
  const tally: DelayTally = {
    total: outcomes.length,
    not_started: 0,
    on_track: 0,
    due_soon: 0,
    overdue: 0,
    completed_on_time: 0,
    completed_late: 0,
  };
  for (const o of outcomes) tally[o.status] += 1;
  return tally;
}
