import { describe, it, expect } from 'vitest';
import {
  buildWhereSql,
  validatePatch,
  predicateSchema,
  BULK_UPDATE_TARGETS,
  applyPerRowEdits,
  type Predicate,
  type BulkUpdateColumn,
} from './bulkUpdate';
import { BadRequestError, ForbiddenError } from '@/lib/errors';

// Pure-logic tests for the predicate translator + patch validator.
// applyBulkUpdate + previewBulkUpdate are DB-bound and stay integration
// territory.

const TEST_COLUMNS: BulkUpdateColumn[] = [
  { name: 'state', label: 'State', type: 'text' },
  { name: 'client_id', label: 'Client', type: 'number' },
  { name: 'due_date', label: 'Due Date', type: 'date' },
];

describe('predicateSchema', () => {
  it('accepts a leaf predicate', () => {
    const p = { col: 'state', op: 'eq', value: 'draft' };
    expect(() => predicateSchema.parse(p)).not.toThrow();
  });

  it('accepts nested all groups', () => {
    const p = {
      all: [
        { col: 'state', op: 'eq', value: 'draft' },
        { col: 'client_id', op: 'eq', value: 5 },
      ],
    };
    expect(() => predicateSchema.parse(p)).not.toThrow();
  });

  it('accepts nested any groups', () => {
    const p = {
      any: [
        { col: 'state', op: 'eq', value: 'draft' },
        { col: 'state', op: 'eq', value: 'submitted' },
      ],
    };
    expect(() => predicateSchema.parse(p)).not.toThrow();
  });

  it('accepts deeply nested mixed predicates', () => {
    const p = {
      all: [
        { col: 'state', op: 'eq', value: 'draft' },
        {
          any: [
            { col: 'client_id', op: 'eq', value: 1 },
            { col: 'client_id', op: 'eq', value: 2 },
          ],
        },
      ],
    };
    expect(() => predicateSchema.parse(p)).not.toThrow();
  });

  it('rejects empty all group', () => {
    expect(() => predicateSchema.parse({ all: [] })).toThrow();
  });

  it('rejects unknown op', () => {
    expect(() =>
      predicateSchema.parse({ col: 'state', op: 'between', value: [1, 2] }),
    ).toThrow();
  });

  it('rejects missing col', () => {
    expect(() => predicateSchema.parse({ op: 'eq', value: 'x' })).toThrow();
  });
});

describe('buildWhereSql column-whitelist enforcement', () => {
  it('compiles a leaf with a whitelisted column', () => {
    const p: Predicate = { col: 'state', op: 'eq', value: 'draft' };
    expect(() => buildWhereSql(p, TEST_COLUMNS)).not.toThrow();
  });

  it('throws BadRequestError on a column outside the whitelist', () => {
    const p: Predicate = { col: 'password_hash', op: 'eq', value: 'x' };
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it('throws on a column outside the whitelist inside a nested group', () => {
    const p: Predicate = {
      all: [
        { col: 'state', op: 'eq', value: 'draft' },
        { col: 'created_by', op: 'eq', value: 1 },
      ],
    };
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it('throws on empty all group', () => {
    const p = { all: [] } as unknown as Predicate;
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it('throws on empty any group', () => {
    const p = { any: [] } as unknown as Predicate;
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it("throws when op='in' is given a non-array value", () => {
    const p: Predicate = { col: 'state', op: 'in', value: 'draft' };
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it("throws when op='in' is given an empty array", () => {
    const p: Predicate = { col: 'state', op: 'in', value: [] };
    expect(() => buildWhereSql(p, TEST_COLUMNS)).toThrow(BadRequestError);
  });

  it('accepts isNull / isNotNull without a value', () => {
    expect(() =>
      buildWhereSql({ col: 'due_date', op: 'isNull' }, TEST_COLUMNS),
    ).not.toThrow();
    expect(() =>
      buildWhereSql({ col: 'due_date', op: 'isNotNull' }, TEST_COLUMNS),
    ).not.toThrow();
  });

  it("accepts op='in' with a non-empty array", () => {
    expect(() =>
      buildWhereSql(
        { col: 'state', op: 'in', value: ['draft', 'submitted'] },
        TEST_COLUMNS,
      ),
    ).not.toThrow();
  });
});

describe('validatePatch', () => {
  const EDITABLE: BulkUpdateColumn[] = [
    { name: 'notes', label: 'Notes', type: 'text' },
    { name: 'due_date', label: 'Due Date', type: 'date' },
  ];

  it('accepts a patch with whitelisted columns', () => {
    const result = validatePatch({ notes: 'hi', due_date: '2026-12-31' }, EDITABLE);
    expect(result.get('notes')).toBe('hi');
    expect(result.get('due_date')).toBe('2026-12-31');
  });

  it('throws BadRequestError on an unknown key', () => {
    expect(() =>
      validatePatch({ password_hash: 'leak' }, EDITABLE),
    ).toThrow(BadRequestError);
  });

  it('throws on an empty patch', () => {
    expect(() => validatePatch({}, EDITABLE)).toThrow(BadRequestError);
  });

  it('throws if any key is outside the whitelist (even with valid keys present)', () => {
    expect(() =>
      validatePatch({ notes: 'ok', state: 'approved' }, EDITABLE),
    ).toThrow(BadRequestError);
  });

  it('passes null and falsy values through unchanged', () => {
    const result = validatePatch(
      { notes: null, due_date: '' },
      EDITABLE,
    );
    expect(result.get('notes')).toBeNull();
    expect(result.get('due_date')).toBe('');
  });
});

describe('BULK_UPDATE_TARGETS whitelist (security invariants)', () => {
  it('every target excludes `state` from editable columns', () => {
    for (const [entity, target] of Object.entries(BULK_UPDATE_TARGETS)) {
      const editableNames = target.editableColumns.map((c) => c.name);
      expect(editableNames, `${entity} editable`).not.toContain('state');
    }
  });

  it('every target excludes `id` from filter + editable columns', () => {
    for (const [entity, target] of Object.entries(BULK_UPDATE_TARGETS)) {
      const filterNames = target.filterColumns.map((c) => c.name);
      const editableNames = target.editableColumns.map((c) => c.name);
      expect(filterNames, `${entity} filter`).not.toContain('id');
      expect(editableNames, `${entity} editable`).not.toContain('id');
    }
  });

  it('every target has at least one editable column', () => {
    for (const [entity, target] of Object.entries(BULK_UPDATE_TARGETS)) {
      expect(target.editableColumns.length, `${entity}`).toBeGreaterThan(0);
    }
  });

  it('every target has at least one filter column', () => {
    for (const [entity, target] of Object.entries(BULK_UPDATE_TARGETS)) {
      expect(target.filterColumns.length, `${entity}`).toBeGreaterThan(0);
    }
  });

  it('every target table name matches the _t convention', () => {
    for (const [entity, target] of Object.entries(BULK_UPDATE_TARGETS)) {
      expect(target.table, `${entity}`).toMatch(/_t$/);
    }
  });

  it('import target is registered with the expected editable columns', () => {
    const t = BULK_UPDATE_TARGETS.import;
    expect(t).toBeDefined();
    const editableNames = t.editableColumns.map((c) => c.name);
    // Sanity — the fields that a per-row bulk editor needs to
    // stamp on partial import rows.
    expect(editableNames).toContain('declaration_reference');
    expect(editableNames).toContain('customs_manifest_number');
    expect(editableNames).toContain('dgda_in_date');
    // Financial columns must NOT be in the whitelist — those flow
    // from source documents and shouldn't be bulk-edited.
    expect(editableNames).not.toContain('weight');
    expect(editableNames).not.toContain('fob');
  });
});

// applyPerRowEdits validation runs BEFORE any transaction opens.
// These tests exercise the validation branches without needing a
// live DB — a failure here means a bad request would reach the
// database as if it were valid.

describe('applyPerRowEdits — validation', () => {
  it('throws ForbiddenError on unknown entity', async () => {
    await expect(
      applyPerRowEdits({
        entity: 'notarealthing',
        edits: [{ id: 1, patch: { notes: 'x' } }],
        actorUserId: 1,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws BadRequestError on empty edits array', async () => {
    await expect(
      applyPerRowEdits({
        entity: 'import',
        edits: [],
        actorUserId: 1,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError on invalid row id', async () => {
    await expect(
      applyPerRowEdits({
        entity: 'import',
        edits: [{ id: 0, patch: { declaration_reference: 'x' } }],
        actorUserId: 1,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when a patch targets a non-whitelisted column', async () => {
    // `weight` is intentionally NOT in the import editable set —
    // this must fail before any UPDATE runs.
    await expect(
      applyPerRowEdits({
        entity: 'import',
        edits: [{ id: 1, patch: { weight: 100 } }],
        actorUserId: 1,
      }),
    ).rejects.toThrow(BadRequestError);
  });
});
