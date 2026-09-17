import { describe, it, expect } from 'vitest';
import { labelOf, orderOptions, optionRows, type SelectOption } from '@/lib/selectOptions';

// §4.16 — one rule decides the order of every dropdown in the app. If this
// changes, every picker on every screen changes with it, so it is pinned here.

const opt = (value: string, label: string): SelectOption => ({ value, label });

describe('orderOptions', () => {
  it('puts entity-backed options in ascending id order, not alphabetical', () => {
    const out = orderOptions([opt('3', 'Alpha'), opt('1', 'Zulu'), opt('2', 'Mike')]);
    expect(out.map((o) => o.value)).toEqual(['1', '2', '3']);
    expect(out.map((o) => o.label)).toEqual(['Zulu', 'Mike', 'Alpha']);
  });

  // The bug that motivated the rule: a new row whose name sorts first used to
  // displace every other option, changing a picker the operator knew by position.
  it('appends a new row at the end however its label sorts', () => {
    const before = [opt('1', 'Kinshasa'), opt('2', 'Lubumbashi')];
    const after = orderOptions([...before, opt('3', 'AAA Depot')]);
    expect(after.map((o) => o.label)).toEqual(['Kinshasa', 'Lubumbashi', 'AAA Depot']);
  });

  it('sorts numerically, not as text', () => {
    const out = orderOptions([opt('10', 'ten'), opt('9', 'nine'), opt('100', 'hundred')]);
    expect(out.map((o) => o.value)).toEqual(['9', '10', '100']);
  });

  it('keeps a non-id list exactly as authored', () => {
    // Workflow stages, status codes and Y/N pairs carry a meaningful sequence
    // that alphabetising destroyed.
    const stages = [opt('draft', 'Draft'), opt('approved', 'Approved'), opt('paid', 'Paid')];
    expect(orderOptions(stages)).toEqual(stages);
  });

  it('leaves a mixed list alone rather than half-sorting it', () => {
    const mixed = [opt('2', 'Two'), opt('all', 'All'), opt('1', 'One')];
    expect(orderOptions(mixed).map((o) => o.value)).toEqual(['2', 'all', '1']);
  });

  it('treats an empty value as not-an-id', () => {
    // The clear/none row is rendered separately via emptyLabel, but an option
    // list carrying '' must not be read as id 0 and hoisted to the top.
    const withBlank = [opt('2', 'Two'), opt('', 'None'), opt('1', 'One')];
    expect(orderOptions(withBlank).map((o) => o.value)).toEqual(['2', '', '1']);
  });

  it('does not mutate the array it was given', () => {
    const input = [opt('2', 'Two'), opt('1', 'One')];
    orderOptions(input);
    expect(input.map((o) => o.value)).toEqual(['2', '1']);
  });

  it('handles the empty list', () => {
    expect(orderOptions([])).toEqual([]);
  });
});

describe('optionRows', () => {
  it('reads a flat data array', () => {
    expect(optionRows({ ok: true, data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  // The paginated envelope. Half the copies of the old per-page helper missed
  // this shape, so the same dropdown was populated on one screen and empty on another.
  it('reads a paginated data.items array', () => {
    expect(optionRows({ ok: true, data: { items: [{ id: 2 }], total: 1 } })).toEqual([{ id: 2 }]);
  });

  it('returns nothing for a failed or malformed envelope', () => {
    expect(optionRows({ ok: false, error: { message: 'nope' } })).toEqual([]);
    expect(optionRows({ ok: true, data: null })).toEqual([]);
    expect(optionRows(undefined)).toEqual([]);
  });
});

describe('labelOf', () => {
  it('takes the first field that carries something', () => {
    expect(labelOf({ id: 4, unit_code: 'KG', unit_name: 'Kilogram' }, ['unit_code', 'unit_name']))
      .toBe('KG');
  });

  // The defect this exists for: unit_master_t has an OPTIONAL short code beside
  // a required name, every live row's code is null, and asking for the code
  // alone rendered the quotation grid's Unit picker as "1, 2, 3, …".
  it('falls through to the next field when the preferred one is null', () => {
    expect(labelOf({ id: 4, unit_code: null, unit_name: 'CIF' }, ['unit_code', 'unit_name']))
      .toBe('CIF');
  });

  it('treats blank and whitespace as absent, not as a label', () => {
    // An option labelled '   ' is indistinguishable from its neighbours, which
    // is the same failure as labelling it with an id.
    expect(labelOf({ id: 7, code: '', name: 'Per Truck' }, ['code', 'name'])).toBe('Per Truck');
    expect(labelOf({ id: 7, code: '   ', name: 'Per Truck' }, ['code', 'name'])).toBe('Per Truck');
  });

  it('accepts a numeric label rather than skipping past it', () => {
    // 'PER 1' style units really are stored as bare numbers on this data.
    expect(labelOf({ id: 9, unit_name: 1 }, ['unit_name'])).toBe('1');
  });

  it('falls back to the id only when every candidate is empty', () => {
    expect(labelOf({ id: 12, unit_code: null, unit_name: null }, ['unit_code', 'unit_name']))
      .toBe('12');
  });

  it('still works with a single field, the way most callers ask', () => {
    expect(labelOf({ id: 3, department_name: 'Finance' }, ['department_name'])).toBe('Finance');
  });
});
