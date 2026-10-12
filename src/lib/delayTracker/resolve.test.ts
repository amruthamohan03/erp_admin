import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarSpan,
  dueMark,
  resolveDelay,
  tallyDelays,
  warnThreshold,
  type DelayRule,
} from './resolve';

// 2026-10-05 is a Monday: Mon 5 … Fri 9, Sat 10, Sun 11, Mon 12.
const NO_HOLIDAYS = new Set<string>();

function rule(over: Partial<DelayRule> = {}): DelayRule {
  return {
    id: 1,
    key: 'import_default',
    module: 'import',
    name: 'Import Clearance',
    transportLetter: null,
    startField: 'pre_alert_date',
    endField: 'dispatch_deliver_date',
    targetDays: 5,
    dayBasis: 'working',
    notifyDaysBefore: [3, 1],
    notifyOverdue: true,
    stages: [],
    ...over,
  };
}

describe('addDays', () => {
  // The reason this function exists: adding three to a Thursday is not the
  // answer, because two of the next three days are a weekend.
  it('skips the weekend when counting a working-day allowance', () => {
    expect(addDays('2026-10-08', 3, 'working', NO_HOLIDAYS)).toBe('2026-10-13');
  });

  it('counts straight through for a calendar allowance', () => {
    expect(addDays('2026-10-08', 3, 'calendar', NO_HOLIDAYS)).toBe('2026-10-11');
  });

  it('skips a DRC holiday as well as the weekend', () => {
    expect(addDays('2026-10-05', 3, 'working', new Set(['2026-10-07']))).toBe('2026-10-09');
  });

  // Same-day work: the allowance runs out on the start date itself, not on the
  // next working day.
  it('is the start date for a zero-day allowance', () => {
    expect(addDays('2026-10-05', 0, 'working', NO_HOLIDAYS)).toBe('2026-10-05');
  });

  it('returns null for an unusable start', () => {
    expect(addDays('', 3, 'working', NO_HOLIDAYS)).toBeNull();
    expect(addDays('0000-00-00', 3, 'working', NO_HOLIDAYS)).toBeNull();
  });

  // The inverse must agree with the counter, or the due date on screen and the
  // days-remaining beside it would contradict each other.
  it('agrees with the working-day counter in both directions', () => {
    for (const start of ['2026-10-05', '2026-10-08', '2026-10-09', '2026-10-11']) {
      for (const n of [1, 3, 5, 10]) {
        const due = addDays(start, n, 'working', NO_HOLIDAYS)!;
        const r = resolveDelay(
          { pre_alert_date: start, dispatch_deliver_date: due },
          rule({ targetDays: n }),
          NO_HOLIDAYS,
          '2026-12-31',
        );
        expect(r.elapsed_days).toBe(n);
        expect(r.remaining_days).toBe(0);
      }
    }
  });
});

describe('calendarSpan', () => {
  it('counts from the day after the start, up to and including the end', () => {
    expect(calendarSpan('2026-10-05', '2026-10-08')).toBe(3);
    expect(calendarSpan('2026-10-05', '2026-10-05')).toBe(0);
  });

  it('is null when the end precedes the start, rather than negative', () => {
    expect(calendarSpan('2026-10-08', '2026-10-05')).toBeNull();
  });
});

describe('a running file', () => {
  it('is on track well inside its allowance', () => {
    const r = resolveDelay({ pre_alert_date: '2026-10-05' }, rule(), NO_HOLIDAYS, '2026-10-06');
    expect(r.elapsed_days).toBe(1);
    expect(r.remaining_days).toBe(4);
    expect(r.status).toBe('on_track');
    expect(r.due_date).toBe('2026-10-12');
  });

  // The amber band begins exactly where the first notification would, so an
  // operator can never see "on track" on a file already warned about.
  it('turns due_soon at the widest notification mark, not before', () => {
    const base = { pre_alert_date: '2026-10-05' };
    expect(resolveDelay(base, rule(), NO_HOLIDAYS, '2026-10-06').status).toBe('on_track');
    // Tue–Thu elapsed = 3, two days left, which is inside the 3-day mark.
    expect(resolveDelay(base, rule(), NO_HOLIDAYS, '2026-10-08').status).toBe('due_soon');
  });

  it('is overdue once the allowance is spent and nothing has finished it', () => {
    const r = resolveDelay({ pre_alert_date: '2026-10-05' }, rule(), NO_HOLIDAYS, '2026-10-14');
    expect(r.remaining_days).toBeLessThan(0);
    expect(r.status).toBe('overdue');
  });

  it('has not started without a start date', () => {
    const r = resolveDelay({}, rule(), NO_HOLIDAYS, '2026-10-14');
    expect(r.status).toBe('not_started');
    expect(r.elapsed_days).toBeNull();
    expect(r.remaining_days).toBeNull();
  });
});

describe('a finished file', () => {
  it('is measured to its own end date, not to today', () => {
    const file = { pre_alert_date: '2026-10-05', dispatch_deliver_date: '2026-10-08' };
    const soon = resolveDelay(file, rule(), NO_HOLIDAYS, '2026-10-09');
    const muchLater = resolveDelay(file, rule(), NO_HOLIDAYS, '2027-06-01');
    expect(soon).toEqual(muchLater);
    expect(muchLater.elapsed_days).toBe(3);
    expect(muchLater.status).toBe('completed_on_time');
  });

  it('records that it finished late rather than hiding it', () => {
    const r = resolveDelay(
      { pre_alert_date: '2026-10-05', dispatch_deliver_date: '2026-10-19' },
      rule(),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(r.status).toBe('completed_late');
    expect(r.remaining_days).toBeLessThan(0);
  });
});

describe('the end date is the rule, not the module', () => {
  // The air rule's whole difference: the same process, a different finish
  // line. A road file is not complete because an airport date is blank.
  it('completes an air file on Dispatch from Airport', () => {
    const air = rule({ key: 'import_air', transportLetter: 'A', endField: 'dispatch_from_airport' });
    const file = { pre_alert_date: '2026-10-05', dispatch_from_airport: '2026-10-07' };
    expect(resolveDelay(file, air, NO_HOLIDAYS, '2026-10-20').status).toBe('completed_on_time');
    // The same file against the road rule is still running — it has no
    // Dispatch/Deliver date.
    expect(resolveDelay(file, rule(), NO_HOLIDAYS, '2026-10-20').status).toBe('overdue');
  });
});

describe('calendar-basis rules', () => {
  it('counts weekends against the allowance', () => {
    const cal = rule({ dayBasis: 'calendar', targetDays: 5 });
    // Mon 5 → Mon 12 is 7 calendar days but only 5 working ones.
    expect(resolveDelay({ pre_alert_date: '2026-10-05' }, cal, NO_HOLIDAYS, '2026-10-12').status).toBe('overdue');
    expect(resolveDelay({ pre_alert_date: '2026-10-05' }, rule(), NO_HOLIDAYS, '2026-10-12').remaining_days).toBe(0);
  });
});

describe('sub-periods', () => {
  const withStages = rule({
    stages: [
      { key: 'a', label: 'Pre Alert → Zambia', short: 'A', from: 'pre_alert_date', to: 'arrival_date_zambia', target: 2, priority: false, color: '#111', icon: 'clock' },
      { key: 'b', label: 'Zambia → DRC', short: 'B', from: 'arrival_date_zambia', to: 'drc_entry_date', target: 2, priority: true, color: '#222', icon: 'flag' },
    ],
  });

  it('measures each leg on its own dates and allowance', () => {
    const r = resolveDelay(
      { pre_alert_date: '2026-10-05', arrival_date_zambia: '2026-10-06', drc_entry_date: '2026-10-09' },
      withStages,
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(r.stages[0]).toMatchObject({ days: 1, over_by: -1, status: 'completed_on_time', pending: false });
    expect(r.stages[1]).toMatchObject({ days: 3, over_by: 1, status: 'completed_late', pending: false });
  });

  it('ages an unfinished leg to today and marks it pending', () => {
    const r = resolveDelay(
      { pre_alert_date: '2026-10-05', arrival_date_zambia: '2026-10-06' },
      withStages,
      NO_HOLIDAYS,
      '2026-10-09',
    );
    expect(r.stages[1].pending).toBe(true);
    expect(r.stages[1].days).toBe(3);
    expect(r.stages[1].status).toBe('overdue');
  });

  it('leaves a leg unmeasured when it has not begun', () => {
    const r = resolveDelay({ pre_alert_date: '2026-10-05' }, withStages, NO_HOLIDAYS, '2026-10-09');
    expect(r.stages[1]).toMatchObject({ days: null, over_by: null, status: 'not_started' });
  });
});

describe('warnThreshold', () => {
  it('is the widest configured mark', () => {
    expect(warnThreshold(rule({ notifyDaysBefore: [5, 3, 1] }))).toBe(5);
  });

  it('is zero when a rule warns at nothing, so only overdue is amber', () => {
    expect(warnThreshold(rule({ notifyDaysBefore: [] }))).toBe(0);
  });
});

describe('dueMark', () => {
  // A ten-day allowance, so the marks sit inside it. With marks as wide as the
  // target — a 5-day warning on a 5-day process — the first one fires on day
  // zero, which is what that configuration literally asks for.
  const r = rule({ targetDays: 10, notifyDaysBefore: [5, 3, 1] });
  const at = (today: string) => dueMark(resolveDelay({ pre_alert_date: '2026-10-05' }, r, NO_HOLIDAYS, today), r);

  it('raises nothing while the file is comfortably on track', () => {
    expect(at('2026-10-05')).toBeNull(); // 10 left
    expect(at('2026-10-08')).toBeNull(); // 7 left
  });

  // The tightest mark at or above the days left, so a file jumping from six
  // days to two gives the three-day warning rather than skipping to nothing.
  it('gives the tightest mark the remaining days have reached', () => {
    expect(at('2026-10-12')).toBe(5); // 5 left — the boundary is inclusive
    expect(at('2026-10-14')).toBe(3); // 3 left
    expect(at('2026-10-16')).toBe(1); // 1 left
  });

  it('gives the overdue mark once the allowance is spent', () => {
    expect(at('2026-10-21')).toBe(-1);
  });

  it('gives nothing overdue when the rule says not to', () => {
    const quiet = rule({ targetDays: 10, notifyOverdue: false });
    expect(dueMark(resolveDelay({ pre_alert_date: '2026-10-05' }, quiet, NO_HOLIDAYS, '2026-10-21'), quiet)).toBeNull();
  });

  it('gives nothing for a finished file, however late it was', () => {
    const done = resolveDelay(
      { pre_alert_date: '2026-10-05', dispatch_deliver_date: '2026-10-30' },
      r,
      NO_HOLIDAYS,
      '2026-11-30',
    );
    expect(done.status).toBe('completed_late');
    expect(dueMark(done, r)).toBeNull();
  });
});

describe('tallyDelays', () => {
  it('counts each status and the total', () => {
    const r = rule();
    const outcomes = [
      resolveDelay({ pre_alert_date: '2026-10-05' }, r, NO_HOLIDAYS, '2026-10-06'),
      resolveDelay({ pre_alert_date: '2026-10-05' }, r, NO_HOLIDAYS, '2026-10-14'),
      resolveDelay({}, r, NO_HOLIDAYS, '2026-10-14'),
    ];
    expect(tallyDelays(outcomes)).toEqual({
      total: 3,
      not_started: 1,
      on_track: 1,
      due_soon: 0,
      overdue: 1,
      completed_on_time: 0,
      completed_late: 0,
    });
  });
});
