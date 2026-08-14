import { ZodError, type ZodIssue } from 'zod';

// §4.23 — one place that turns a machine-shaped validation failure into a
// sentence an operator can act on.
//
// Every route funnels its ZodError through withErrorHandler, which used to
// answer `{ message: 'Invalid input' }` for all of them. Every client renders
// `json.error?.message`, so a save that failed because the tagline was three
// characters too long and a save that failed because the client was missing
// read identically — and neither named the field. This module is the fix, and
// because it sits under the wrapper it applies to every route at once (§4.10).
//
// The output has two halves and both matter:
//   message — human, names the field(s), safe to show verbatim in a dialog.
//   fields  — { path: [messages] }, for marking the offending input (§4.18).

/** `{ project_name: ['Project Name is required'] }` — keyed by the wire path. */
export type FieldMessages = Record<string, string[]>;

export interface ValidationSummary {
  message: string;
  fields: FieldMessages;
}

/**
 * `accordions.0.values.client_id` → `Client Id`.
 *
 * Field names reach here as the wire path, which is snake_case and may be
 * nested through array indices. Operators read labels, not paths, so drop the
 * numeric segments, take the leaf, and title-case it. A schema that wants a
 * better name than its key produces one by giving the field an explicit Zod
 * message (see below) — this is the fallback, not the ceiling.
 */
export function humanizeFieldPath(path: Array<string | number>): string {
  const segments = path.filter((p) => typeof p === 'string') as string[];
  const leaf = segments[segments.length - 1];
  if (!leaf) return 'This value';
  return leaf
    .replace(/_(id|url)$/i, '')
    .split(/[_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Rewrite Zod's built-in wording into something an operator can act on.
 *
 * Zod's defaults describe the *type system* ("Expected string, received null",
 * "String must contain at least 1 character(s)"), which tells a developer what
 * the parser saw and tells an operator nothing. A schema that supplies its own
 * message keeps it — an explicit message always wins over anything generated
 * here, which is how a field gets domain wording ("Must be a 6-digit hex
 * color").
 */
function issueSentence(issue: ZodIssue, label: string): string {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') {
        return `${label} is required.`;
      }
      return `${label} must be ${withArticle(String(issue.expected))}.`;

    case 'too_small': {
      const min = issue.minimum;
      if (issue.type === 'string') {
        return min === 1
          ? `${label} is required.`
          : `${label} must be at least ${min} characters.`;
      }
      if (issue.type === 'array') {
        return min === 1
          ? `Add at least one ${label.toLowerCase()}.`
          : `${label} needs at least ${min} entries.`;
      }
      return `${label} must be ${issue.inclusive ? 'at least' : 'greater than'} ${min}.`;
    }

    case 'too_big': {
      const max = issue.maximum;
      if (issue.type === 'string') return `${label} must be ${max} characters or fewer.`;
      if (issue.type === 'array') return `${label} allows at most ${max} entries.`;
      return `${label} must be ${issue.inclusive ? 'at most' : 'less than'} ${max}.`;
    }

    case 'invalid_enum_value':
      return `${label} must be one of: ${issue.options.join(', ')}.`;

    case 'invalid_string':
      if (issue.validation === 'email') return `${label} must be a valid email address.`;
      if (issue.validation === 'url') return `${label} must be a valid URL.`;
      if (issue.validation === 'uuid') return `${label} must be a valid ID.`;
      return `${label} is not in the expected format.`;

    case 'unrecognized_keys':
      return `Unexpected field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}.`;

    case 'invalid_date':
      return `${label} must be a valid date.`;

    default:
      // Custom refinements and anything Zod adds later: the schema author's own
      // wording is already the best sentence available.
      return issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
  }
}

function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/**
 * A Zod issue carries a default message unless the schema passed its own. Zod 3
 * gives no flag for that, so compare against the shape of the defaults we
 * rewrite — anything that doesn't match was authored deliberately and is kept.
 */
function hasCustomMessage(issue: ZodIssue): boolean {
  switch (issue.code) {
    case 'invalid_type':
      // Zod 3 shortens the missing-key case to the bare word "Required", which
      // is a default despite not matching the "Expected …, received …" shape.
      return issue.message !== 'Required' && !/^Expected .+, received .+$/.test(issue.message);
    case 'too_small':
    case 'too_big':
      return !/(must contain|greater than|less than|bigger than|smaller than)/i.test(issue.message);
    case 'invalid_string':
      return !/^Invalid( .+)?$/.test(issue.message);
    case 'invalid_enum_value':
      return !/^Invalid enum value/.test(issue.message);
    default:
      return true;
  }
}

/** One issue → the sentence shown next to the field. */
export function issueMessage(issue: ZodIssue): string {
  const label = humanizeFieldPath(issue.path);
  if (hasCustomMessage(issue)) {
    const own = issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
    // A schema message names the constraint, not the field ("Must be a 6-digit
    // hex color"), so prefix the label unless the author already did.
    return own.toLowerCase().startsWith(label.toLowerCase()) ? own : `${label}: ${own}`;
  }
  return issueSentence(issue, label);
}

/** How many field names to spell out before falling back to a count. */
const MAX_NAMED_FIELDS = 3;

/**
 * ZodError → the sentence for a dialog, plus per-field messages for the form.
 *
 * One bad field reads as the field's own sentence, because that is the whole
 * story. Several read as a list, so the operator knows the save needs more than
 * one fix before they go hunting.
 */
export function summarizeZodError(error: ZodError): ValidationSummary {
  const fields: FieldMessages = {};
  const sentences: string[] = [];

  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    const text = issueMessage(issue);
    (fields[key] ??= []).push(text);
    if (!sentences.includes(text)) sentences.push(text);
  }

  if (sentences.length === 0) return { message: 'The information supplied is not valid.', fields };
  if (sentences.length === 1) return { message: sentences[0], fields };

  const named = Object.keys(fields).slice(0, MAX_NAMED_FIELDS).map((k) => humanizeFieldPath(k.split('.')));
  const total = Object.keys(fields).length;
  const rest = total - named.length;
  const list = rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');
  return { message: `Please correct ${total} fields: ${list}.`, fields };
}

/**
 * Postgres reports a few constraint failures that are really validation errors
 * the schema could not catch — a value longer than the column, a number outside
 * its precision. They arrive as a driver error, not a ZodError, and used to
 * surface as "Server error" with a 500. Mapping them here keeps §4.23's promise
 * that a rejected save always says what to change.
 *
 * Returns null for codes that are genuinely server-side, so the caller logs and
 * 500s as before.
 */
export function messageForPgError(err: {
  code?: string;
  column?: string;
  table?: string;
  constraint?: string;
  detail?: string;
}): { message: string; status: number } | null {
  const target = err.column ? humanizeFieldPath([err.column]) : 'One of the values';
  switch (err.code) {
    case '22001':
      return { message: `${target} is too long for the field it is stored in.`, status: 422 };
    case '22003':
      return { message: `${target} is outside the range this field accepts.`, status: 422 };
    case '22P02':
      return { message: `${target} is not in the expected format.`, status: 422 };
    case '23502':
      return { message: `${target} is required.`, status: 422 };
    case '23514':
      return {
        message: `${target} is not an accepted value${err.constraint ? ` (${err.constraint})` : ''}.`,
        status: 422,
      };
    default:
      return null;
  }
}
