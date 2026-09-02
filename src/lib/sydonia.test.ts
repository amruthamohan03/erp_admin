import { describe, expect, it } from 'vitest';
import {
  SYDONIA_DATA_COLUMNS,
  classifyRow,
  cleanDate,
  normalizeRef,
  parseDataCells,
  type RefMatch,
  type SydoniaRow,
} from './sydonia';

const EMPTY: SydoniaRow = {
  mca_ref: '',
  declaration_reference: '',
  declaration_date: '',
  liquidation_reference: '',
  liquidation_date: '',
  quittance_reference: '',
  quittance_date: '',
  liquidation_amount: '',
};

const row = (over: Partial<SydoniaRow>): SydoniaRow => ({ ...EMPTY, mca_ref: 'KIP-EDCUR25-0015', ...over });
const visible: RefMatch = { id: 7, display: 'Y' };
const deleted: RefMatch = { id: 7, display: 'N' };

describe('cleanDate', () => {
  it('reads a day-first date the way the rest of the app writes one (§4.19)', () => {
    expect(cleanDate('03/04/2026')).toBe('2026-04-03');
    expect(cleanDate('3-4-2026')).toBe('2026-04-03');
    expect(cleanDate('03.04.2026')).toBe('2026-04-03');
  });

  it('reads an ISO date textually, so it does not shift by a day west of Greenwich', () => {
    // `new Date('2025-08-29')` is UTC midnight — the 28th in Kinshasa's western
    // neighbours, and in every US timezone. Parsing the string by hand is what
    // keeps an uploaded file's dates stable wherever the server runs (§4.19).
    expect(cleanDate('2025-08-29')).toBe('2025-08-29');
    expect(cleanDate('2025-08-29T00:00:00Z')).toBe('2025-08-29');
    expect(cleanDate('2025-01-01')).toBe('2025-01-01');
    expect(cleanDate('2025-12-31')).toBe('2025-12-31');
  });

  it('rejects an ISO string whose parts are not a real date', () => {
    expect(cleanDate('2025-13-01')).toBeNull();
    expect(cleanDate('2025-02-30')).toBeNull();
  });

  it('expands a two-digit year', () => {
    expect(cleanDate('29/08/25')).toBe('2025-08-29');
  });

  it('rejects an impossible date rather than rolling it forward', () => {
    // `new Date(2026, 1, 31)` is 3 March. Silently accepting that is a customs
    // date wrong by days with nothing on screen to show it.
    expect(cleanDate('31/02/2026')).toBeNull();
    expect(cleanDate('00/01/2026')).toBeNull();
    expect(cleanDate('01/13/2026')).toBeNull();
  });

  it('does not mistake a reference for a date', () => {
    expect(cleanDate('DEC-2026-0001')).toBeNull();
    expect(cleanDate('KIP-EDCUR25-0015')).toBeNull();
    expect(cleanDate('n/a')).toBeNull();
  });

  it('is null for an empty cell', () => {
    expect(cleanDate('')).toBeNull();
    expect(cleanDate('   ')).toBeNull();
  });
});

describe('normalizeRef', () => {
  it('matches regardless of case and surrounding space', () => {
    expect(normalizeRef('  kip-edcur25-0015 ')).toBe('KIP-EDCUR25-0015');
  });
});

describe('parseDataCells', () => {
  it('keeps only the cells that will actually be written', () => {
    const { parsed, warnings } = parseDataCells(
      row({ declaration_reference: ' 2041 ', declaration_date: '2025-08-29', liquidation_amount: '29084933' }),
    );
    expect(parsed).toEqual({
      declaration_reference: '2041',
      declaration_date: '2025-08-29',
      liquidation_amount: '29084933',
    });
    expect(warnings).toEqual([]);
  });

  it('warns about an unreadable date instead of dropping it silently', () => {
    const { parsed, warnings } = parseDataCells(row({ declaration_date: '31/02/2026' }));
    expect(parsed.declaration_date).toBeUndefined();
    expect(warnings[0]).toContain('Declaration Date (column C)');
    expect(warnings[0]).toContain('31/02/2026');
    expect(warnings[0]).toContain('left unchanged');
  });

  it('warns about an unreadable amount', () => {
    const { parsed, warnings } = parseDataCells(row({ liquidation_amount: 'to follow' }));
    expect(parsed.liquidation_amount).toBeUndefined();
    expect(warnings[0]).toContain('Liquidation Amount (column H)');
  });

  it('names every column by its sheet letter, so a message points at a cell', () => {
    const letters = SYDONIA_DATA_COLUMNS.map((c) => c.letter);
    expect(letters).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });
});

describe('classifyRow', () => {
  const opts = { kind: 'import' as const, alreadySeen: false };

  it('is ready when the reference exists and there is something to write', () => {
    const v = classifyRow(row({ declaration_reference: '2041' }), visible, opts);
    expect(v.status).toBe('ready');
    expect(v.reason).toBe('');
    expect(v.record_id).toBe(7);
  });

  it('reports a reference that is not in the database, and names it', () => {
    const v = classifyRow(row({ declaration_reference: '2041' }), undefined, opts);
    expect(v.status).toBe('missing');
    expect(v.reason).toContain('KIP-EDCUR25-0015');
    expect(v.reason).toContain('does not exist in the import records');
    expect(v.record_id).toBeNull();
  });

  it('distinguishes a deleted record from a missing one', () => {
    // Reporting a soft-deleted record as "not in the database" sends the operator
    // hunting for something that is actually sitting in the Recycle Bin (§4.27).
    const v = classifyRow(row({ declaration_reference: '2041' }), deleted, opts);
    expect(v.status).toBe('deleted');
    expect(v.reason).toContain('Recycle Bin');
  });

  it('reports a found reference whose columns B to H are empty', () => {
    const v = classifyRow(row({}), visible, opts);
    expect(v.status).toBe('empty');
    expect(v.reason).toContain('columns B to H');
  });

  it('treats a row whose only values are unreadable as having nothing to write', () => {
    const v = classifyRow(row({ declaration_date: 'not a date' }), visible, opts);
    expect(v.status).toBe('empty');
    expect(v.warnings).toHaveLength(1);
  });

  it('flags the second appearance of a reference, not the first', () => {
    const r = row({ declaration_reference: '2041' });
    expect(classifyRow(r, visible, opts).status).toBe('ready');
    expect(classifyRow(r, visible, { ...opts, alreadySeen: true }).status).toBe('duplicate');
    expect(classifyRow(r, visible, { ...opts, alreadySeen: true }).reason).toContain('more than once');
  });

  it('says "export records" on the export screen', () => {
    const v = classifyRow(row({ declaration_reference: '2041' }), undefined, { kind: 'export', alreadySeen: false });
    expect(v.reason).toContain('export records');
  });

  it('gives every rejection a sentence naming the reference and the fix (§4.23)', () => {
    const cases = [
      classifyRow(row({}), undefined, opts),
      classifyRow(row({}), deleted, opts),
      classifyRow(row({}), visible, opts),
      classifyRow(row({}), visible, { ...opts, alreadySeen: true }),
    ];
    for (const v of cases) {
      expect(v.status).not.toBe('ready');
      expect(v.reason).toContain('KIP-EDCUR25-0015');
      expect(v.reason.length).toBeGreaterThan(30);
    }
  });
});
