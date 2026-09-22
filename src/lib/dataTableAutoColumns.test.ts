import { describe, it, expect } from 'vitest';
import { deriveAutoColumns } from './dataTableAutoColumns';
import { cellText } from './dataTableSort';

// §4.25.1 — every field the rows carry is offered in the column chooser.

const opts = { sortable: true };
const keys = (cols: Array<{ key: string }>) => cols.map((c) => c.key);

describe('deriveAutoColumns', () => {
  it('offers a field the table does not declare', () => {
    const rows = [{ id: 1, client_name: 'ACME', regime_name: 'IM4' }];
    expect(keys(deriveAutoColumns(rows, [{ key: 'client_name' }], opts))).toEqual(['regime_name']);
  });

  it('never offers a declared column twice', () => {
    const rows = [{ client_name: 'ACME', bank: 'RAW' }];
    const derived = deriveAutoColumns(rows, [{ key: 'client_name' }, { key: 'bank' }], opts);
    expect(derived).toEqual([]);
  });

  it('excludes primary and foreign keys', () => {
    const rows = [{ id: 1, client_id: 7, license_id: 3, client_name: 'ACME' }];
    expect(keys(deriveAutoColumns(rows, [], opts))).toEqual(['client_name']);
  });

  it('excludes credentials', () => {
    const rows = [{ username: 'amrutha', password_hash: 'x', reset_token: 'y', api_secret: 'z' }];
    expect(keys(deriveAutoColumns(rows, [], opts))).toEqual(['username']);
  });

  it('excludes a value with no honest one-line rendering', () => {
    const rows = [{ ref: 'A', remarks: [{ note: 'hi' }], meta: { a: 1 } }];
    expect(keys(deriveAutoColumns(rows, [], opts))).toEqual(['ref']);
  });

  it('starts every derived column hidden', () => {
    const rows = [{ address: 'Kinshasa' }];
    expect(deriveAutoColumns(rows, [], opts)[0].defaultHidden).toBe(true);
  });

  it('offers nothing when there are no rows to learn from', () => {
    expect(deriveAutoColumns([], [{ key: 'client_name' }], opts)).toEqual([]);
  });

  it('unions the fields across rows, so a sparse first row hides nothing', () => {
    const rows = [{ ref: 'A' }, { ref: 'B', vessel_name: 'MSC' }];
    expect(keys(deriveAutoColumns(rows, [], opts))).toEqual(['ref', 'vessel_name']);
  });

  it('humanizes the header from the key', () => {
    const rows = [{ vessel_name: 'MSC', pre_alert_date: '2026-08-03' }];
    const derived = deriveAutoColumns(rows, [], opts);
    expect(derived.map((c) => c.header)).toEqual(['Vessel Name', 'Pre Alert Date']);
  });

  it('defers sorting to the endpoint in server mode', () => {
    const rows = [{ vessel_name: 'MSC' }];
    expect(deriveAutoColumns(rows, [], { sortable: false })[0].sortable).toBe(false);
  });
});

// §4.19 — a derived column is still a date a person reads.
describe('derived date columns', () => {
  const render = (rows: Array<Record<string, unknown>>, key: string) => {
    const col = deriveAutoColumns(rows, [], opts).find((c) => c.key === key);
    return col?.render?.(rows[0], 0);
  };

  it('renders a stored date as DD-MM-YYYY', () => {
    expect(render([{ pre_alert_date: '2026-08-03' }], 'pre_alert_date')).toBe('03-08-2026');
  });

  it('renders a timestamp with its clock', () => {
    expect(render([{ created_at: '2026-08-03T14:30:00Z' }], 'created_at')).toContain('03-08-2026');
  });

  it('leaves a reference that merely starts with digits alone', () => {
    expect(render([{ invoice_ref: '2026-NMI-EXP-0001' }], 'invoice_ref')).toBe('2026-NMI-EXP-0001');
  });

  it('shows an em dash for an empty value', () => {
    expect(render([{ address: null }], 'address')).toBe('—');
  });

  it('keeps the date searchable in both forms it can be typed', () => {
    const rows = [{ pre_alert_date: '2026-08-03' }];
    const col = deriveAutoColumns(rows, [], opts)[0];
    expect(cellText(rows[0], col)).toContain('03-08-2026');
    expect(cellText(rows[0], col)).toContain('2026-08-03');
  });
});

// §4.38 — the soft-delete flag is a status, and reads as one.
describe('the display flag', () => {
  it('sorts and filters on the words it shows, not on Y/N', () => {
    const rows = [{ display: 'Y' }, { display: 'N' }];
    const col = deriveAutoColumns(rows, [], opts)[0];
    expect(cellText(rows[0], col)).toBe('Active');
    expect(cellText(rows[1], col)).toBe('Disabled');
  });
});

describe('boolean fields', () => {
  it('reads as Yes / No rather than true / false', () => {
    const rows = [{ has_tva: true }, { has_tva: false }];
    const col = deriveAutoColumns(rows, [], opts)[0];
    expect(col.render?.(rows[0], 0)).toBe('Yes');
    expect(cellText(rows[1], col)).toBe('No');
  });
});
