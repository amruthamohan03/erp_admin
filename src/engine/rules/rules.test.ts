import { describe, it, expect } from 'vitest';
import { applyRule } from './index';

// Tests cover the pure applyRule wrapper — the JSON Logic operators that
// real rules will use. loadRule + evaluateRule hit the DB and are tested in
// integration once a DB harness lands.

describe('applyRule — JSON Logic evaluation', () => {
  describe('primitives & basic eval', () => {
    it('returns literal numbers unchanged', () => {
      expect(applyRule(42)).toBe(42);
    });

    it('returns literal strings unchanged', () => {
      expect(applyRule('hello')).toBe('hello');
    });

    it('resolves "var" against the context', () => {
      expect(applyRule({ var: 'name' }, { name: 'satheesh' })).toBe('satheesh');
    });

    it('returns null for missing vars (json-logic default)', () => {
      expect(applyRule({ var: 'missing' }, {})).toBeNull();
    });

    it('supports nested var paths', () => {
      const ctx = { user: { profile: { full_name: 'Jane' } } };
      expect(applyRule({ var: 'user.profile.full_name' }, ctx)).toBe('Jane');
    });

    it('throws when rule_json is empty (null/undefined)', () => {
      expect(() => applyRule(null)).toThrow(/empty/);
      expect(() => applyRule(undefined)).toThrow(/empty/);
    });
  });

  describe('comparison operators', () => {
    it('equality (==)', () => {
      expect(applyRule({ '==': [1, 1] })).toBe(true);
      expect(applyRule({ '==': [1, 2] })).toBe(false);
    });

    it('strict equality (===)', () => {
      expect(applyRule({ '===': [1, '1'] })).toBe(false);
      expect(applyRule({ '===': [1, 1] })).toBe(true);
    });

    it('greater-than against context vars', () => {
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(applyRule(rule, { amount: 1500 })).toBe(true);
      expect(applyRule(rule, { amount: 500 })).toBe(false);
    });

    it('in (substring or array membership)', () => {
      expect(applyRule({ in: ['ad', 'admin'] })).toBe(true);
      expect(applyRule({ in: ['admin', ['admin', 'user']] })).toBe(true);
      expect(applyRule({ in: ['guest', ['admin', 'user']] })).toBe(false);
    });
  });

  describe('logical & math', () => {
    it('and short-circuits to the first falsy', () => {
      expect(applyRule({ and: [true, false, true] })).toBe(false);
    });

    it('or returns the first truthy', () => {
      expect(applyRule({ or: [0, '', 'hit', 'after'] })).toBe('hit');
    });

    it('not negates', () => {
      expect(applyRule({ '!': true })).toBe(false);
      expect(applyRule({ '!': 0 })).toBe(true);
    });

    it('math operators (+ - * /)', () => {
      expect(applyRule({ '+': [1, 2, 3] })).toBe(6);
      expect(applyRule({ '-': [10, 4] })).toBe(6);
      expect(applyRule({ '*': [2, 3] })).toBe(6);
      expect(applyRule({ '/': [10, 4] })).toBe(2.5);
    });
  });

  describe('realistic compound rules', () => {
    it('workflow transition gate: status == "draft" && amount > 1000', () => {
      const rule = {
        and: [
          { '==': [{ var: 'status' }, 'draft'] },
          { '>': [{ var: 'amount' }, 1000] },
        ],
      };
      expect(applyRule(rule, { status: 'draft', amount: 1500 })).toBe(true);
      expect(applyRule(rule, { status: 'draft', amount: 500 })).toBe(false);
      expect(applyRule(rule, { status: 'approved', amount: 1500 })).toBe(false);
    });

    it('permission rule: department in [Finance, Management]', () => {
      const rule = {
        in: [{ var: 'user.department' }, ['Finance', 'Management']],
      };
      expect(applyRule(rule, { user: { department: 'Finance' } })).toBe(true);
      expect(applyRule(rule, { user: { department: 'Logistics' } })).toBe(false);
    });

    it('returns a non-boolean — rules can compute values too (e.g. tax)', () => {
      const taxRule = { '*': [{ var: 'amount' }, 0.18] };
      expect(applyRule(taxRule, { amount: 1000 })).toBe(180);
    });
  });
});
