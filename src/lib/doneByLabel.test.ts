import { describe, it, expect } from 'vitest';
import { resolveDoneByName, resolveDoneByNames } from './doneByLabel';

// The company row's label is configuration, not data: it renders as the project
// name so a rename in Settings → Application reaches every Liquidation Paid By /
// License Cleared By / License Submitted To Bank picker at once.

const CLIENT = { done_by_name: 'Client', is_company: false };
const COMPANY = { done_by_name: 'Malabar', is_company: true };

describe('resolveDoneByName', () => {
  it('leaves a normal entry alone', () => {
    expect(resolveDoneByName(CLIENT, 'Acme Logistics')).toBe('Client');
  });

  it('renders the company entry as the project name', () => {
    expect(resolveDoneByName(COMPANY, 'Acme Logistics')).toBe('Acme Logistics');
  });

  it('follows a project rename without touching the row', () => {
    expect(resolveDoneByName(COMPANY, 'Renamed SARL')).toBe('Renamed SARL');
    expect(COMPANY.done_by_name).toBe('Malabar'); // stored value untouched
  });

  // An option with a blank label is unselectable, so a missing project name has
  // to fall through to something rather than render empty.
  it('falls back to the stored name when the project name is blank', () => {
    expect(resolveDoneByName(COMPANY, '')).toBe('Malabar');
    expect(resolveDoneByName(COMPANY, '   ')).toBe('Malabar');
  });

  it('treats a missing flag as not-the-company', () => {
    expect(resolveDoneByName({ done_by_name: 'Agent' }, 'Acme')).toBe('Agent');
    expect(resolveDoneByName({ done_by_name: 'Agent', is_company: null }, 'Acme')).toBe('Agent');
  });
});

describe('resolveDoneByNames', () => {
  it('maps a list and preserves the other fields', () => {
    const rows = [
      { id: 1, ...CLIENT, display: 'Y' },
      { id: 2, ...COMPANY, display: 'Y' },
    ];
    expect(resolveDoneByNames(rows, 'Acme Logistics')).toEqual([
      { id: 1, done_by_name: 'Client', is_company: false, display: 'Y' },
      { id: 2, done_by_name: 'Acme Logistics', is_company: true, display: 'Y' },
    ]);
  });

  it('does not mutate the input rows', () => {
    const rows = [{ ...COMPANY }];
    resolveDoneByNames(rows, 'Acme');
    expect(rows[0].done_by_name).toBe('Malabar');
  });
});
