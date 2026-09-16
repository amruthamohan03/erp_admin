import { describe, it, expect } from 'vitest';
import { uniqueViolationResponse } from './uniqueness';

async function body(res: Response | null): Promise<Record<string, unknown>> {
  if (!res) throw new Error('expected a response');
  return (await res.json()) as Record<string, unknown>;
}

const dup = (constraint?: string) =>
  Object.assign(new Error('duplicate key'), { code: '23505', constraint });

describe('uniqueViolationResponse', () => {
  it('passes through anything that is not a unique violation', () => {
    // The caller falls through to its own 500 path, so this must be null and
    // not a 422 that swallows an unrelated failure.
    expect(uniqueViolationResponse(new Error('boom'), 'Type')).toBeNull();
    expect(uniqueViolationResponse({ code: '23503' }, 'Type')).toBeNull();
    expect(uniqueViolationResponse(null, 'Type')).toBeNull();
  });

  it('names the single constrained field', async () => {
    const res = uniqueViolationResponse(dup(), 'HS Code Number');
    expect(res?.status).toBe(422);
    const j = await body(res);
    expect(JSON.stringify(j)).toContain('That HS Code Number is already in use');
  });

  it('names the field that ACTUALLY collided when a table constrains several', async () => {
    // The bug this exists for: Type of Goods constrains both columns, and one
    // fixed label reported a duplicate short name as "That Type is already in
    // use" — sending the operator to edit the wrong box.
    const labels = {
      type_of_goods_master_t_type_uq: 'Type',
      type_of_goods_master_t_short_name_uq: 'Short Name',
      default: 'Type',
    };
    expect(JSON.stringify(await body(
      uniqueViolationResponse(dup('type_of_goods_master_t_short_name_uq'), labels),
    ))).toContain('Short Name');
    expect(JSON.stringify(await body(
      uniqueViolationResponse(dup('type_of_goods_master_t_type_uq'), labels),
    ))).toContain('That Type is already in use');
  });

  it('falls back to `default` for a constraint added later', async () => {
    // A new index must degrade to a vague-but-true message, never to
    // "That undefined is already in use".
    const j = await body(
      uniqueViolationResponse(dup('some_index_added_next_year'), {
        type_of_goods_master_t_type_uq: 'Type',
        default: 'Type',
      }),
    );
    expect(JSON.stringify(j)).toContain('That Type is already in use');
    expect(JSON.stringify(j)).not.toContain('undefined');
  });

  it('never says "undefined" when the error carries no constraint name', async () => {
    const j = await body(uniqueViolationResponse(dup(), { default: 'Name' }));
    expect(JSON.stringify(j)).toContain('That Name is already in use');
  });

  it('degrades to a generic noun rather than undefined with no default', async () => {
    const j = await body(uniqueViolationResponse(dup('unknown_ix'), { other: 'Code' }));
    expect(JSON.stringify(j)).toContain('That value is already in use');
  });
});
