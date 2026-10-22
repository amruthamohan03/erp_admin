import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { describeError, findPgError, humanizeFieldPath, messageForPgError, summarizeZodError } from './messages';

// §4.23 — the point of these tests is the *wording*. A message that passes
// type-checking but reads as "Invalid input" is the bug this module exists to
// prevent, so the assertions are about what an operator would see.

function summarize(schema: z.ZodTypeAny, value: unknown) {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error('Expected the schema to reject this value');
  return summarizeZodError(parsed.error);
}

describe('humanizeFieldPath', () => {
  it('turns a wire path into the label the user reads', () => {
    expect(humanizeFieldPath(['project_name'])).toBe('Project Name');
    expect(humanizeFieldPath(['favicon_url'])).toBe('Favicon');
    expect(humanizeFieldPath(['client_id'])).toBe('Client');
  });

  it('drops array indices and keeps the leaf', () => {
    expect(humanizeFieldPath(['accordions', 0, 'values', 'invoice_no'])).toBe('Invoice No');
  });
});

describe('summarizeZodError', () => {
  it('names the missing field instead of saying "Invalid input"', () => {
    const { message, fields } = summarize(z.object({ project_name: z.string().min(1) }), {});
    expect(message).toBe('Project Name is required.');
    expect(fields.project_name).toEqual(['Project Name is required.']);
  });

  it('reports a length cap with the actual number', () => {
    const { message } = summarize(z.object({ tagline: z.string().max(255) }), {
      tagline: 'x'.repeat(300),
    });
    expect(message).toBe('Tagline must be 255 characters or fewer.');
  });

  it('keeps a message the schema author wrote, prefixed with the field', () => {
    const schema = z.object({
      primary_color: z.string().regex(/^#[0-9a-f]{6}$/, 'Must be a 6-digit hex color (e.g. #2563eb)'),
    });
    const { message } = summarize(schema, { primary_color: 'blue' });
    expect(message).toBe('Primary Color: Must be a 6-digit hex color (e.g. #2563eb).');
  });

  it('counts and lists the fields when several are wrong', () => {
    const schema = z.object({
      project_name: z.string().min(1),
      app_title: z.string().min(1),
      primary_color: z.string().min(1),
    });
    const { message, fields } = summarize(schema, {
      project_name: '',
      app_title: '',
      primary_color: '',
    });
    expect(message).toBe('Please correct 3 fields: Project Name, App Title, Primary Color.');
    expect(Object.keys(fields)).toHaveLength(3);
  });

  it('spells out an email and an enum in plain language', () => {
    expect(summarize(z.object({ email: z.string().email() }), { email: 'nope' }).message).toBe(
      'Email must be a valid email address.',
    );
    expect(
      summarize(z.object({ kind: z.enum(['logo', 'favicon']) }), { kind: 'banner' }).message,
    ).toBe('Kind must be one of: logo, favicon.');
  });
});

describe('messageForPgError', () => {
  it('turns a length overflow into a 422 that names the column', () => {
    expect(messageForPgError({ code: '22001', column: 'footer_text' })).toEqual({
      message: 'Footer Text is too long for the field it is stored in.',
      status: 422,
    });
  });

  it('turns a not-null violation into a required message', () => {
    expect(messageForPgError({ code: '23502', column: 'app_title' })?.message).toBe(
      'App Title is required.',
    );
  });

  it('leaves genuinely server-side codes alone so they still 500', () => {
    expect(messageForPgError({ code: '08006' })).toBeNull();
    expect(messageForPgError({ code: '23505' })).toBeNull();
  });
});

// §4.39 — what an operator sees when a save fails for a reason that is not a
// form validation. Drizzle wraps the driver error, so every case is built the
// way it actually arrives: an outer "Failed query" error with the pg error as
// its cause.
const wrapped = (pg: Record<string, unknown>): Error =>
  Object.assign(new Error('Failed query: insert into "license_t" ... params: 1,2'), { cause: pg });

describe('describeError', () => {
  it('finds the driver error inside Drizzle\'s wrapper', () => {
    expect(findPgError(wrapped({ code: '23505' }))?.code).toBe('23505');
    expect(findPgError(new Error('plain'))).toBeNull();
  });

  it('names the field and value of a duplicate', () => {
    const d = describeError(wrapped({
      code: '23505',
      detail: 'Key (license_number)=(NMI-12) already exists.',
    }));
    expect(d).toEqual({
      message: 'License Number "NMI-12" already exists — use a different value.',
      status: 409,
      field: 'license_number',
    });
  });

  it('names a reference that points at a missing record', () => {
    const d = describeError(wrapped({
      code: '23503',
      detail: 'Key (payment_method_id)=(9) is not present in table "payment_method_master_t".',
    }));
    expect(d.status).toBe(422);
    expect(d.field).toBe('payment_method_id');
    expect(d.message).toBe(
      'Payment Method refers to a Payment Method (id 9) that does not exist. Pick another value from the list.',
    );
  });

  it('names what still uses a record that cannot be deleted', () => {
    const d = describeError(wrapped({
      code: '23503',
      detail: 'Key (id)=(4) is still referenced from table "license_t".',
    }));
    expect(d.status).toBe(409);
    expect(d.message).toContain('still used by License');
  });

  it('says the database is behind the code when a column is missing', () => {
    const d = describeError(wrapped({
      code: '42703',
      message: 'column "payment_method_id" does not exist',
    }));
    expect(d.status).toBe(500);
    expect(d.message).toContain('column "payment_method_id" does not exist');
    expect(d.message).toContain('pnpm db:migrate');
  });

  it('keeps the existing named constraint messages', () => {
    expect(describeError(wrapped({ code: '23502', column: 'license_number' }))).toEqual({
      message: 'License Number is required.',
      status: 422,
      field: 'license_number',
    });
  });

  it('reports a connection failure as such', () => {
    const d = describeError(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }));
    expect(d.status).toBe(503);
    expect(d.message).toContain('could not reach the database');
  });

  it('never shows the SQL text from the wrapper', () => {
    const d = describeError(Object.assign(new Error('Failed query: select secret from x'), {
      cause: new Error('something odd'),
    }));
    expect(d.message).toBe('Unexpected error: something odd');
    expect(d.message).not.toContain('select');
  });

  it('passes an unexpected error\'s own reason through', () => {
    expect(describeError(new TypeError("Cannot read properties of undefined (reading 'id')")).message).toBe(
      "Unexpected error: Cannot read properties of undefined (reading 'id')",
    );
  });
});
