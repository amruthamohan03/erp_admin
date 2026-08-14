import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { humanizeFieldPath, messageForPgError, summarizeZodError } from './messages';

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
