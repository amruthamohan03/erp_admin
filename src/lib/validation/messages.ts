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

// ─────────────────────────────────────────────────────────────────────────────
// §4.39 — every failure says exactly what went wrong
// ─────────────────────────────────────────────────────────────────────────────

/** The fields of a Postgres driver error this module reads. */
interface PgErrorLike {
  code?: string;
  message?: string;
  column?: string;
  table?: string;
  constraint?: string;
  detail?: string;
}

export interface ErrorDescription {
  /** The sentence to show — names what failed and, where it can, the fix. */
  message: string;
  status: number;
  /** The wire field to mark, when the failure belongs to one input (§4.18). */
  field?: string;
}

/** A SQLSTATE is five characters; a Node error code (ECONNREFUSED) is not. */
const isSqlState = (code: unknown): code is string =>
  typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code);

/**
 * The Postgres error inside whatever was thrown.
 *
 * Drizzle wraps every driver error in a DrizzleQueryError whose own message is
 * "Failed query: <the SQL>" and whose `.cause` is the real error carrying the
 * SQLSTATE. Reading `.code` off the outer object therefore finds nothing, and
 * every database failure — a duplicate, a missing reference, a missing column —
 * fell through to "Server error". This walks the cause chain instead.
 */
export function findPgError(err: unknown): PgErrorLike | null {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as PgErrorLike & { cause?: unknown };
    if (isSqlState(e.code)) return e;
    cur = e.cause;
  }
  return null;
}

/** Network-level failure codes from Node, anywhere on the cause chain. */
function findNodeErrorCode(err: unknown): string | null {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { code?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && /^E[A-Z]+$/u.test(e.code)) return e.code;
    cur = e.cause;
  }
  return null;
}

/** `Key (license_number)=(NMI-12) already exists.` → ['license_number', 'NMI-12'] */
function keyFromDetail(detail: string | undefined): [string, string] | null {
  const m = /Key \(([^)]+)\)=\((.*)\)/u.exec(detail ?? '');
  return m ? [m[1], m[2]] : null;
}

/** `payment_method_master_t` → `Payment Method` — a table named the way a screen names it. */
function humanizeTable(table: string | undefined): string {
  if (!table) return 'another record';
  return humanizeFieldPath([table.replace(/(_master)?_t$/u, '')]);
}

/**
 * Turns anything a route can throw into a sentence that says what failed.
 *
 * The rule (§4.39): an operator who reads the message must be able to tell
 * WHAT went wrong without asking a developer to open the server log. Known
 * database failures are translated into the field and value involved; a
 * failure this module has no translation for still reports the underlying
 * reason. What is never shown is the SQL text, its parameters or a stack trace
 * — Drizzle's own message embeds the query, which is why the reason is taken
 * from the driver error inside it.
 */
export function describeError(err: unknown): ErrorDescription {
  const pg = findPgError(err);
  if (pg) {
    const known = messageForPgError(pg);
    if (known) return { ...known, ...(pg.column ? { field: pg.column } : {}) };

    const key = keyFromDetail(pg.detail);
    switch (pg.code) {
      case '23505': {
        if (key) {
          const [col, value] = key;
          return {
            message: `${humanizeFieldPath([col.split(',')[0].trim()])} "${value}" already exists — use a different value.`,
            status: 409,
            field: col.includes(',') ? undefined : col,
          };
        }
        return { message: `This record already exists${pg.constraint ? ` (${pg.constraint})` : ''}.`, status: 409 };
      }
      case '23503': {
        // Two shapes: a value pointing at a row that does not exist (insert or
        // update), and a row that cannot go because others still point at it
        // (delete). The detail says which.
        if (pg.detail?.includes('is still referenced')) {
          const by = /from table "([^"]+)"/u.exec(pg.detail)?.[1];
          return {
            message: `This record is still used by ${humanizeTable(by)} and cannot be removed. Remove or change those ${humanizeTable(by).toLowerCase()} records first.`,
            status: 409,
          };
        }
        if (key) {
          const [col, value] = key;
          const target = /in table "([^"]+)"/u.exec(pg.detail ?? '')?.[1];
          return {
            message: `${humanizeFieldPath([col])} refers to a ${humanizeTable(target)} (id ${value}) that does not exist. Pick another value from the list.`,
            status: 422,
            field: col,
          };
        }
        return { message: 'A selected value refers to a record that no longer exists. Re-select it and try again.', status: 422 };
      }
      // The code is ahead of the database: a migration has not been applied.
      case '42703':
      case '42P01':
      case '42883':
        return {
          message: `The database is not up to date with this version of the application (${pg.message ?? pg.code}). An administrator must apply the pending migrations (pnpm db:migrate).`,
          status: 500,
        };
      case '40001':
      case '40P01':
        return { message: 'Another save changed the same records at the same moment. Nothing was saved — try again.', status: 409 };
      case '57014':
        return { message: 'The database took too long to answer and the request was cancelled. Try again; if it keeps happening, narrow the filters.', status: 503 };
      case '53300':
        return { message: 'The database has too many open connections right now. Wait a moment and try again.', status: 503 };
      default:
        if (pg.code?.startsWith('08')) {
          return { message: `The application lost its connection to the database (${pg.message ?? pg.code}). Try again in a moment.`, status: 503 };
        }
        return { message: `The database rejected the request: ${pg.message ?? 'no reason given'} (code ${pg.code}).`, status: 500 };
    }
  }

  const net = findNodeErrorCode(err);
  if (net === 'ECONNREFUSED' || net === 'ENOTFOUND' || net === 'ETIMEDOUT' || net === 'ECONNRESET') {
    return { message: `The application could not reach the database (${net}). Check that the database server is running.`, status: 503 };
  }

  if (err instanceof SyntaxError) {
    return { message: `The request body is not valid JSON: ${err.message}`, status: 400 };
  }
  const reason = firstPlainMessage(err);
  if (reason) return { message: `Unexpected error: ${reason}`, status: 500 };
  return { message: `Unexpected error: ${typeof err === 'string' ? err : 'the server gave no reason'}.`, status: 500 };
}

/**
 * The first message on the cause chain that is not Drizzle's "Failed query:"
 * wrapper — that one embeds the SQL text and its parameters, which are never
 * shown to an operator.
 */
function firstPlainMessage(err: unknown): string | null {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { message?: unknown; cause?: unknown };
    if (typeof e.message === 'string' && e.message && !e.message.startsWith('Failed query')) {
      return e.message;
    }
    cur = e.cause;
  }
  return typeof err === 'string' && err ? err : null;
}
