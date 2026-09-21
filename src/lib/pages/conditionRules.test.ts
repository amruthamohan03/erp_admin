import { describe, it, expect } from 'vitest';
import { resolveFieldState } from './conditions';
import {
  buildLeaf,
  describePredicate,
  fieldsOf,
  operatorsFor,
  predicateForEffect,
  rulesOf,
  type DescribeContext,
} from './conditionRules';

const ctx: DescribeContext = {
  labelOf: (f) => ({ type_of_goods_id: 'Type of Goods', weight: 'Weight' })[f] ?? f,
  valueOf: (f, v) => (f === 'type_of_goods_id' ? ({ 3: 'FUEL', 4: 'COPPER' } as Record<string, string>)[String(v)] ?? String(v) : String(v)),
};

describe('buildLeaf', () => {
  it('keeps a select id numeric, so it matches the stored integer', () => {
    expect(buildLeaf('type_of_goods_id', 'eq', ['3'])).toEqual({ field: 'type_of_goods_id', eq: 3 });
    expect(buildLeaf('type_of_goods_id', 'in', ['3', '4'])).toEqual({ field: 'type_of_goods_id', in: [3, 4] });
  });
  it('needs no value to test filled / empty', () => {
    expect(buildLeaf('weight', 'truthy', [])).toEqual({ field: 'weight', truthy: true });
  });
});

describe('predicateForEffect + the runtime', () => {
  const fuel = buildLeaf('type_of_goods_id', 'eq', ['3']);

  it('Show only when FUEL: visible for FUEL, hidden otherwise', () => {
    const conditions = { visibleWhen: predicateForEffect('show', fuel) };
    expect(resolveFieldState(conditions, false, { type_of_goods_id: '3' }).visible).toBe(true);
    expect(resolveFieldState(conditions, false, { type_of_goods_id: '4' }).visible).toBe(false);
  });

  it('Hide when FUEL: the opposite', () => {
    const conditions = { visibleWhen: predicateForEffect('hide', fuel) };
    expect(resolveFieldState(conditions, false, { type_of_goods_id: 3 }).visible).toBe(false);
    expect(resolveFieldState(conditions, false, { type_of_goods_id: 4 }).visible).toBe(true);
  });
});

describe('describePredicate / rulesOf', () => {
  it('reads as a sentence, with option labels instead of ids', () => {
    expect(describePredicate(buildLeaf('type_of_goods_id', 'in', ['3', '4']), ctx)).toBe('Type of Goods is FUEL or COPPER');
  });

  it('shows a negated visibility as a Hide rule', () => {
    const rules = rulesOf({ visibleWhen: { not: { field: 'type_of_goods_id', eq: 3 } } }, ctx);
    expect(rules).toEqual([{ key: 'visibleWhen', effect: 'hide', when: 'Type of Goods is FUEL' }]);
  });
});

describe('operatorsFor / fieldsOf', () => {
  it('offers ordering only where it means something', () => {
    expect(operatorsFor('number')).toContain('gt');
    expect(operatorsFor('text')).not.toContain('gt');
    expect(operatorsFor('select')).toContain('in');
  });
  it('finds every field a nested predicate reads', () => {
    expect(fieldsOf({ all: [{ field: 'a', eq: 1 }, { not: { field: 'b', truthy: true } }] })).toEqual(['a', 'b']);
  });
});
