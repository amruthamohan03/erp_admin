import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { kindUseForCondition, kindUseForOrMissing } from './kindScope';
import { exportT, importT } from '@/db/schema';

// §4.1 — direction comes from the kind's own FLAGS, never its name or an id list.

const dialect = new PgDialect();
const render = (s: Parameters<typeof dialect.sqlToQuery>[0]) => dialect.sqlToQuery(s).sql;

describe('kindUseForCondition', () => {
  it('asks the export flag for the export side', () => {
    const sql = render(kindUseForCondition(exportT.kind, 'export'));
    expect(sql).toContain('"use_for_export"');
    expect(sql).not.toContain('use_for_import');
  });

  it('asks the import flag for the import side', () => {
    const sql = render(kindUseForCondition(importT.kind, 'import'));
    expect(sql).toContain('"use_for_import"');
    expect(sql).not.toContain('use_for_export');
  });

  // Migration 0062 exists because a kind named "EXPORT DEFINITVE" that somebody
  // renamed would silently drop out of every export form.
  it('never matches on the kind NAME', () => {
    const sql = render(kindUseForCondition(exportT.kind, 'export'));
    expect(sql).not.toMatch(/kind_name|ILIKE|EXPORT%/i);
  });

  it('reads the flag from the kind master, keyed off the row own kind column', () => {
    const sql = render(kindUseForCondition(exportT.kind, 'export'));
    expect(sql).toContain('kind_master_t');
    expect(sql).toContain('"exports_t"."kind"');
  });
});

describe('kindUseForOrMissing', () => {
  // A file saved before the pickers were filtered, or with the kind left empty,
  // has to stay findable — dropping it from both tracking screens would strand
  // it where nobody could reach it to fix.
  it('keeps a row that carries no kind at all', () => {
    const sql = render(kindUseForOrMissing(exportT.kind, 'export'));
    expect(sql).toContain('IS NULL');
    expect(sql).toContain('OR');
  });

  it('still applies the flag alongside the null allowance', () => {
    const sql = render(kindUseForOrMissing(importT.kind, 'import'));
    expect(sql).toContain('"use_for_import"');
    expect(sql).toContain('IS NULL');
  });
});
