import { describe, expect, it } from 'vitest';
import {
  classifyBorderDelay,
  isAtBorder,
  tallyBorderDelays,
  DEFAULT_BORDER_WORKING_DAYS,
  type BorderFileDates,
} from './borderDelay';

// 2026-10-05 is a Monday, so the week in these cases runs Mon 5 … Fri 9,
// Sat 10, Sun 11, Mon 12.
const NO_HOLIDAYS = new Set<string>();

function file(over: Partial<BorderFileDates> = {}): BorderFileDates {
  return {
    drc_entry_date: '2026-10-05',
    dispatch_from_border: null,
    warehouse_arrival_date: null,
    border_max_working_days: 3,
    ...over,
  };
}

describe('the allowance is counted in working days', () => {
  it('counts from the day AFTER entry, up to and including dispatch', () => {
    // Mon -> Wed is two working days, which the rule treats as on time.
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-07' }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.working_days).toBe(2);
    expect(d.outcome).toBe('on_time');
  });

  it('is on time exactly AT the limit, not over it', () => {
    // Mon -> Thu = 3 working days, and the rule is "max 3".
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-08' }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.working_days).toBe(3);
    expect(d.outcome).toBe('on_time');
  });

  it('is delayed one day past the limit', () => {
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-09' }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.working_days).toBe(4);
    expect(d.outcome).toBe('delayed');
  });

  it('skips the weekend, so a Friday entry has until Wednesday', () => {
    // Fri 9 -> Wed 14 is Mon, Tue, Wed = 3 working days. The same span in
    // calendar days is 5, which would wrongly read as delayed.
    const d = classifyBorderDelay(
      file({ drc_entry_date: '2026-10-09', dispatch_from_border: '2026-10-14' }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.working_days).toBe(3);
    expect(d.outcome).toBe('on_time');
  });

  it('skips a DRC holiday as well as the weekend', () => {
    // Wed 7 is a holiday, so Mon -> Thu counts Tue and Thu only.
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-08' }),
      new Set(['2026-10-07']),
      '2026-10-20',
    );
    expect(d.working_days).toBe(2);
    expect(d.outcome).toBe('on_time');
  });
});

describe('a file still at the border is measured against today', () => {
  // This is the point of the screen: an overstaying truck must show as
  // overstaying now, not once somebody finally records its departure.
  it('reports the days accrued so far and flags the overstay', () => {
    const d = classifyBorderDelay(file(), NO_HOLIDAYS, '2026-10-12');
    expect(d.working_days).toBe(5); // Tue, Wed, Thu, Fri, Mon
    expect(d.outcome).toBe('delayed');
    expect(d.still_waiting).toBe(true);
  });

  it('does not let a dispatched file drift into delay as time passes', () => {
    const dispatched = file({ dispatch_from_border: '2026-10-07' });
    const soon = classifyBorderDelay(dispatched, NO_HOLIDAYS, '2026-10-08');
    const muchLater = classifyBorderDelay(dispatched, NO_HOLIDAYS, '2027-06-01');
    expect(soon).toEqual(muchLater);
    expect(muchLater.outcome).toBe('on_time');
    expect(muchLater.still_waiting).toBe(false);
  });
});

describe('the allowance comes from the entry point', () => {
  it('honours a post configured with a longer allowance', () => {
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-09', border_max_working_days: 5 }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.working_days).toBe(4);
    expect(d.limit).toBe(5);
    expect(d.outcome).toBe('on_time');
  });

  it('falls back to the column default when a post carries none', () => {
    const d = classifyBorderDelay(
      file({ dispatch_from_border: '2026-10-09', border_max_working_days: null }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.limit).toBe(DEFAULT_BORDER_WORKING_DAYS);
    expect(d.outcome).toBe('delayed');
  });
});

describe('spans that cannot be measured', () => {
  it('is unmeasured without a DRC Entry date', () => {
    const d = classifyBorderDelay(file({ drc_entry_date: null }), NO_HOLIDAYS, '2026-10-12');
    expect(d.outcome).toBe('unmeasured');
    expect(d.working_days).toBeNull();
  });

  // A dispatch before the entry is a data error. Reporting it as "0 days, on
  // time" would file the bad record under the good ones.
  it('is unmeasured when dispatch precedes entry, rather than zero days', () => {
    const d = classifyBorderDelay(
      file({ drc_entry_date: '2026-10-08', dispatch_from_border: '2026-10-05' }),
      NO_HOLIDAYS,
      '2026-10-20',
    );
    expect(d.outcome).toBe('unmeasured');
  });

  it("treats main's zero date as absent", () => {
    const d = classifyBorderDelay(
      file({ drc_entry_date: '0000-00-00' }),
      NO_HOLIDAYS,
      '2026-10-12',
    );
    expect(d.outcome).toBe('unmeasured');
  });
});

describe('isAtBorder', () => {
  it('is true for a file with an entry but no dispatch', () => {
    expect(isAtBorder(file())).toBe(true);
  });

  it('is false once dispatched', () => {
    expect(isAtBorder(file({ dispatch_from_border: '2026-10-07' }))).toBe(false);
  });

  // The goods are demonstrably gone, so the gap is a missing date rather than
  // a truck sitting at the border — that belongs on the Briefing tab.
  it('is false once the file reached the final warehouse, dispatch date or not', () => {
    expect(isAtBorder(file({ warehouse_arrival_date: '2026-10-15' }))).toBe(false);
  });
});

describe('tallyBorderDelays', () => {
  it('counts each outcome and the total', () => {
    const today = '2026-10-20';
    const delays = [
      classifyBorderDelay(file({ dispatch_from_border: '2026-10-07' }), NO_HOLIDAYS, today),
      classifyBorderDelay(file({ dispatch_from_border: '2026-10-09' }), NO_HOLIDAYS, today),
      classifyBorderDelay(file({ drc_entry_date: null }), NO_HOLIDAYS, today),
    ];
    expect(tallyBorderDelays(delays)).toEqual({
      on_time: 1,
      delayed: 1,
      unmeasured: 1,
      total: 3,
    });
  });
});
