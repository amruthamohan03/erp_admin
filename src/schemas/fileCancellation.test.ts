import { describe, it, expect } from 'vitest';
import { fileCancellationOptionsQuery, fileCancellationSchema } from './fileCancellation';

const valid = {
  kind: 'import',
  client_id: 16,
  file_ids: [12, 13],
  reason_id: 1,
  cancelled_date: '2026-09-18',
};

describe('fileCancellationSchema', () => {
  it('accepts a complete cancellation', () => {
    expect(fileCancellationSchema.parse(valid)).toMatchObject({ kind: 'import', file_ids: [12, 13] });
  });

  it('names the field when no file is chosen', () => {
    const r = fileCancellationSchema.safeParse({ ...valid, file_ids: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('MCA References: choose at least one file to cancel.');
  });

  it('refuses a tracking type that is not Import, Export or Local', () => {
    const r = fileCancellationSchema.safeParse({ ...valid, kind: 'bivac' });
    expect(r.error?.issues[0]?.message).toBe('Tracking Type: choose Import, Export or Local.');
  });

  it('refuses a cancelled date in the future', () => {
    const r = fileCancellationSchema.safeParse({ ...valid, cancelled_date: '2999-01-01' });
    expect(r.error?.issues[0]?.message).toBe('Cancelled Date cannot be in the future.');
  });
});

describe('fileCancellationOptionsQuery', () => {
  it('reads the licence list from a comma-separated query value', () => {
    const q = fileCancellationOptionsQuery.parse({ kind: 'export', client_id: '15', license_ids: '0,17' });
    expect(q.license_ids).toEqual([0, 17]);
  });

  it('treats an absent licence list as none', () => {
    expect(fileCancellationOptionsQuery.parse({ kind: 'local', client_id: '3' }).license_ids).toEqual([]);
  });

  it('refuses a licence list that is not ids', () => {
    const r = fileCancellationOptionsQuery.safeParse({ kind: 'import', client_id: '3', license_ids: '1,abc' });
    expect(r.error?.issues[0]?.message).toBe('License Numbers must be a comma-separated list of ids.');
  });
});
