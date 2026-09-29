import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  defaultAllHeadings,
  defaultHeadings,
  headingFor,
  isColumnOf,
  isGridKey,
  mergeHeadings,
} from './columns';

describe('grid column registry', () => {
  it('recognises the three grids and nothing else', () => {
    expect(isGridKey('import-cdf')).toBe(true);
    expect(isGridKey('import-usd')).toBe(true);
    expect(isGridKey('export-usd')).toBe(true);
    expect(isGridKey('anything')).toBe(false);
  });

  it('accepts only a column the grid actually draws', () => {
    // A column key names a field the renderer reads, so an unknown one must not
    // become a configurable row — it would be a heading over nothing.
    expect(isColumnOf('import-cdf', 'rate_cdf')).toBe(true);
    expect(isColumnOf('import-cdf', 'currency')).toBe(false);
    expect(isColumnOf('import-usd', 'currency')).toBe(true);
  });

  it('matches the headings the grid renders today', () => {
    // These are the labels on screen before the master existed. If this test
    // changes, an operator's column silently got a new name.
    expect(GRID_COLUMNS['import-cdf'].map((c) => c.heading)).toEqual([
      'Description',
      'Unit',
      'CIF/Split',
      '%',
      'Rate/CDF',
      'VAT/CDF',
      'Total/CDF',
    ]);
    expect(GRID_COLUMNS['import-usd'].map((c) => c.heading)).toEqual([
      'Description',
      'Unit',
      'Qty',
      'Taux/USD',
      'Currency',
      'TVA',
      'TVA/USD',
      'Total en USD',
    ]);
  });
});

describe('headingFor', () => {
  it('uses the configured heading when there is one', () => {
    expect(headingFor('import-cdf', 'rate_cdf', { rate_cdf: 'Taux CDF' })).toBe('Taux CDF');
  });

  it('falls back to the built-in when nothing is configured', () => {
    expect(headingFor('import-cdf', 'rate_cdf', undefined)).toBe('Rate/CDF');
    expect(headingFor('import-cdf', 'rate_cdf', {})).toBe('Rate/CDF');
  });

  it('treats a blank configured heading as not configured', () => {
    // Clearing the box must restore the built-in name, not leave a column with
    // no header that nobody can identify in order to fix it.
    expect(headingFor('import-cdf', 'rate_cdf', { rate_cdf: '   ' })).toBe('Rate/CDF');
  });

  it('never returns empty, even for a column it has never heard of', () => {
    expect(headingFor('import-cdf', 'mystery', undefined)).toBe('mystery');
  });
});

describe('mergeHeadings', () => {
  it('returns every column of the grid, configured or not', () => {
    const merged = mergeHeadings('import-cdf', { rate_cdf: 'Taux CDF' });
    expect(Object.keys(merged)).toHaveLength(GRID_COLUMNS['import-cdf'].length);
    expect(merged.rate_cdf).toBe('Taux CDF');
    expect(merged.description).toBe('Description');
  });

  it('ignores a configured key the grid does not draw', () => {
    // A row left behind by a renamed column must not add a phantom heading.
    const merged = mergeHeadings('import-cdf', { currency: 'Devise' });
    expect(merged.currency).toBeUndefined();
  });
});

describe('defaults', () => {
  it('defaultHeadings keys by column', () => {
    expect(defaultHeadings('export-usd').tva_16).toBe('TVA 16%');
  });

  it('defaultAllHeadings covers all three grids', () => {
    expect(Object.keys(defaultAllHeadings()).sort()).toEqual([
      'export-usd',
      'import-cdf',
      'import-usd',
    ]);
  });
});
