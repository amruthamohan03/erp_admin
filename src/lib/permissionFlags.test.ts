import { describe, it, expect } from 'vitest';
import {
  PERMISSION_FLAGS,
  PERMISSION_FLAG_KEYS,
  grantsNothing,
  roleMenuMappingPutSchema,
} from '@/schemas/role-menu-mapping';

// §4.14 / §4.27 — the flag list drives the Zod row shape, the save predicate and
// the matrix columns. A flag missing from any one of those fails silently: the
// UI shows a switch that never persists.

describe('permission flag list', () => {
  it('carries the three delete-related grants as separate flags', () => {
    // The whole point of §4.27: hiding, un-hiding and destroying are distinct.
    expect(PERMISSION_FLAG_KEYS).toContain('can_delete');
    expect(PERMISSION_FLAG_KEYS).toContain('can_restore');
    expect(PERMISSION_FLAG_KEYS).toContain('can_permanent_delete');
  });

  it('covers every action §14 of the spec asks for', () => {
    for (const k of [
      'can_view', 'can_add', 'can_edit', 'can_delete', 'can_restore',
      'can_permanent_delete', 'can_approve', 'can_export', 'can_import',
      'can_print', 'can_view_audit', 'can_export_audit', 'can_manage_settings',
    ]) {
      expect(PERMISSION_FLAG_KEYS).toContain(k);
    }
  });

  it('has a unique key and a label for each flag', () => {
    expect(new Set(PERMISSION_FLAG_KEYS).size).toBe(PERMISSION_FLAG_KEYS.length);
    for (const f of PERMISSION_FLAGS) expect(f.label.trim()).not.toBe('');
  });
});

describe('grantsNothing', () => {
  const allFalse = Object.fromEntries(PERMISSION_FLAG_KEYS.map((k) => [k, false]));

  it('is true when nothing is granted', () => {
    expect(grantsNothing(allFalse)).toBe(true);
  });

  // Each flag independently keeps a row alive — this is what stops a grant being
  // dropped because the predicate forgot to mention it.
  it.each(PERMISSION_FLAG_KEYS)('is false when only %s is granted', (key) => {
    expect(grantsNothing({ ...allFalse, [key]: true })).toBe(false);
  });
});

describe('roleMenuMappingPutSchema', () => {
  it('defaults every unspecified flag to false', () => {
    const parsed = roleMenuMappingPutSchema.parse({
      role_id: 1,
      mappings: [{ menu_id: 7, can_view: true }],
    });
    const row = parsed.mappings[0] as Record<string, unknown>;
    expect(row.can_view).toBe(true);
    for (const k of PERMISSION_FLAG_KEYS.filter((x) => x !== 'can_view')) {
      expect(row[k]).toBe(false);
    }
  });

  it('accepts a row granting permanent delete without granting delete', () => {
    // Not a recommended configuration, but the model must not couple them —
    // coupling is exactly what §4.27 forbids.
    const parsed = roleMenuMappingPutSchema.parse({
      role_id: 1,
      mappings: [{ menu_id: 7, can_permanent_delete: true }],
    });
    const row = parsed.mappings[0] as Record<string, unknown>;
    expect(row.can_permanent_delete).toBe(true);
    expect(row.can_delete).toBe(false);
    expect(grantsNothing(row)).toBe(false);
  });
});
