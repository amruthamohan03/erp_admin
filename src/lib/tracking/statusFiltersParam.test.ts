import { describe, it, expect } from 'vitest';
import { statusFiltersFromParam } from './statusFiltersParam';

const known = (k: string) => ['completed', 'crf_missing', 'in_transit'].includes(k);

describe('statusFiltersFromParam', () => {
  it('reads a single key', () => {
    expect(statusFiltersFromParam('crf_missing', known)).toEqual(['crf_missing']);
  });

  it('reads several, comma separated', () => {
    expect(statusFiltersFromParam('completed,in_transit', known)).toEqual(['completed', 'in_transit']);
  });

  it('tolerates spacing around the commas', () => {
    expect(statusFiltersFromParam(' completed , in_transit ', known)).toEqual(['completed', 'in_transit']);
  });

  // The value comes from a URL anyone can edit. A key the list cannot act on
  // must not reach the endpoint and leave the grid claiming a filter it has not
  // applied.
  it('drops a key the module does not know', () => {
    expect(statusFiltersFromParam('completed,made_up', known)).toEqual(['completed']);
  });

  it('de-duplicates', () => {
    expect(statusFiltersFromParam('completed,completed', known)).toEqual(['completed']);
  });

  it('treats absent, empty and all-invalid the same — no filter', () => {
    expect(statusFiltersFromParam(null, known)).toEqual([]);
    expect(statusFiltersFromParam(undefined, known)).toEqual([]);
    expect(statusFiltersFromParam('', known)).toEqual([]);
    expect(statusFiltersFromParam(',,', known)).toEqual([]);
    expect(statusFiltersFromParam('nope', known)).toEqual([]);
  });
});
