import { describe, it, expect } from 'vitest';
import {
  effectivePermission,
  canViewField,
  canEditField,
  writableFieldIds,
  visibleFieldIds,
  annotateVisibleFields,
  type FieldPermission,
} from './formFieldGrants';

// fetchFieldGrants is DB-bound and stays integration territory; these tests
// pin the pure semantics consumed by every enforcement site (form GET,
// createCase, advanceCase, future UI).

function grants(...entries: Array<[number, FieldPermission]>): Map<number, FieldPermission> {
  return new Map(entries);
}

describe('effectivePermission', () => {
  it('returns edit by default when no grant is set', () => {
    expect(effectivePermission(new Map(), 1)).toBe('edit');
  });

  it('returns the explicit grant when set', () => {
    expect(effectivePermission(grants([1, 'view']), 1)).toBe('view');
    expect(effectivePermission(grants([1, 'edit']), 1)).toBe('edit');
    expect(effectivePermission(grants([1, 'hidden']), 1)).toBe('hidden');
  });

  it('falls back to default for fields not in the map', () => {
    expect(effectivePermission(grants([1, 'view']), 2)).toBe('edit');
  });
});

describe('canViewField', () => {
  it('returns true for edit (default) and view', () => {
    expect(canViewField(new Map(), 1)).toBe(true);
    expect(canViewField(grants([1, 'edit']), 1)).toBe(true);
    expect(canViewField(grants([1, 'view']), 1)).toBe(true);
  });

  it('returns false only for hidden', () => {
    expect(canViewField(grants([1, 'hidden']), 1)).toBe(false);
  });
});

describe('canEditField', () => {
  it('returns true only for edit (incl. default)', () => {
    expect(canEditField(new Map(), 1)).toBe(true);
    expect(canEditField(grants([1, 'edit']), 1)).toBe(true);
  });

  it('returns false for view and hidden', () => {
    expect(canEditField(grants([1, 'view']), 1)).toBe(false);
    expect(canEditField(grants([1, 'hidden']), 1)).toBe(false);
  });
});

describe('writableFieldIds', () => {
  const fields = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];

  it('keeps fields with edit (default) permission', () => {
    expect(writableFieldIds(fields, new Map())).toEqual(fields);
  });

  it('drops fields with view permission', () => {
    expect(
      writableFieldIds(fields, grants([2, 'view'])).map((f) => f.id),
    ).toEqual([1, 3]);
  });

  it('drops fields with hidden permission', () => {
    expect(
      writableFieldIds(fields, grants([1, 'hidden'], [3, 'hidden'])).map((f) => f.id),
    ).toEqual([2]);
  });

  it('honors mixed grants', () => {
    expect(
      writableFieldIds(
        fields,
        grants([1, 'view'], [2, 'edit'], [3, 'hidden']),
      ).map((f) => f.id),
    ).toEqual([2]);
  });
});

describe('visibleFieldIds', () => {
  const fields = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];

  it('keeps fields with view, edit, or no grant', () => {
    expect(
      visibleFieldIds(
        fields,
        grants([1, 'view'], [2, 'edit']),
      ).map((f) => f.id),
    ).toEqual([1, 2, 3]);
  });

  it('drops only hidden fields', () => {
    expect(
      visibleFieldIds(fields, grants([2, 'hidden'])).map((f) => f.id),
    ).toEqual([1, 3]);
  });
});

describe('annotateVisibleFields', () => {
  const fields = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];

  it('defaults every field to edit when grants is empty', () => {
    const out = annotateVisibleFields(fields, new Map());
    expect(out).toEqual([
      { id: 1, name: 'a', permission: 'edit' },
      { id: 2, name: 'b', permission: 'edit' },
      { id: 3, name: 'c', permission: 'edit' },
    ]);
  });

  it('annotates per-field grants and drops hidden in one pass', () => {
    const out = annotateVisibleFields(
      fields,
      grants([1, 'view'], [2, 'hidden'], [3, 'edit']),
    );
    expect(out).toEqual([
      { id: 1, name: 'a', permission: 'view' },
      { id: 3, name: 'c', permission: 'edit' },
    ]);
  });

  it('preserves source field order for non-hidden entries', () => {
    const out = annotateVisibleFields(
      [
        { id: 5, name: 'e' },
        { id: 1, name: 'a' },
        { id: 7, name: 'g' },
      ],
      grants([1, 'view'], [7, 'hidden']),
    );
    expect(out.map((f) => f.id)).toEqual([5, 1]);
  });
});
