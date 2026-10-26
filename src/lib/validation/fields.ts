// §4.40 — the format rules for the fields every module shares (email, phone,
// and the unusual-value checks), written ONCE and used by both sides: the
// browser shows the same sentence under the field that the server returns on
// save, because both call these functions (§4.10, §4.23).
//
// Pure — no DB, no React — so it runs in a route handler, a Zod refinement and
// a component alike.
//
// Two severities, and the difference matters:
//   error   — the value cannot be right. The save is refused (422, field named).
//   warning — the value is allowed but looks wrong. Shown in amber under the
//             field; it NEVER blocks a save, because the operator may know better
//             (a client who really is on hotmial.com, a weight that really is 0).

import { z } from 'zod';

export interface FieldCheck {
  /** The value to store — trimmed / normalised. Absent when there is an error. */
  value?: string;
  /** Why the value cannot be accepted. Blocks the save. */
  error?: string;
  /** Why the value looks wrong. Never blocks the save. */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Misspellings of the providers operators actually type, mapped to the
 * intended domain. A warning, not a correction: the app never rewrites an
 * address on its own.
 */
const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
};

/** The local part and domain rules of an address an operator can actually mail. */
const EMAIL_LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u;
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/**
 * Checks one email address. `label` is the field as the operator sees it
 * ("Payment Contact Email"), so every sentence names the field.
 *
 * The stored form keeps the local part as typed and lower-cases the domain,
 * which is case-insensitive by definition.
 */
export function checkEmail(raw: string, label = 'Email', max = 100): FieldCheck {
  const v = raw.trim();
  if (!v) return { value: '', warnings: [] };
  if (v.length > max) {
    return { error: `${label} must be ${max} characters or fewer — this one is ${v.length}.`, warnings: [] };
  }
  if (/\s/u.test(v)) return { error: `${label} cannot contain spaces.`, warnings: [] };
  const at = v.split('@');
  if (at.length === 1) return { error: `${label} is missing the "@" — it should look like name@company.com.`, warnings: [] };
  if (at.length > 2) return { error: `${label} has more than one "@" — enter a single address.`, warnings: [] };
  const [local, domainRaw] = at;
  if (!local) return { error: `${label} is missing the part before the "@".`, warnings: [] };
  if (!domainRaw) return { error: `${label} is missing the domain after the "@" (e.g. company.com).`, warnings: [] };
  if (!EMAIL_LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { error: `${label} has characters that are not allowed before the "@".`, warnings: [] };
  }
  const domain = domainRaw.toLowerCase();
  const labels = domain.split('.');
  if (labels.length < 2) {
    return { error: `${label} needs a full domain after the "@", with a dot — e.g. ${local}@company.com.`, warnings: [] };
  }
  if (!labels.every((l) => EMAIL_DOMAIN_LABEL.test(l))) {
    return { error: `${label} has an invalid domain "${domainRaw}".`, warnings: [] };
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/u.test(tld)) {
    return { error: `${label} ends in ".${tld}", which is not a valid domain ending.`, warnings: [] };
  }

  const warnings: string[] = [];
  const intended = EMAIL_DOMAIN_TYPOS[domain];
  if (intended) warnings.push(`${label}: did you mean ${local}@${intended}?`);
  return { value: `${local}@${domain}`, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone
// ─────────────────────────────────────────────────────────────────────────────

/** ITU E.164: a country code plus subscriber number, 15 digits at most. */
export const PHONE_MIN_DIGITS = 8;
export const PHONE_MAX_DIGITS = 15;

/**
 * Checks one phone number. Any international number is accepted (§4.40).
 *
 * Separators an operator types — spaces, dashes, dots, brackets — are allowed
 * and stripped; a leading `00` is the international prefix and becomes `+`.
 * Stored as `+<digits>` when a country code is present, so every copy of the
 * same number compares equal. A number with no country code is still accepted,
 * but warned about and stored as digits only: guessing the country would
 * silently attach the wrong one.
 */
export function checkPhone(raw: string, label = 'Phone'): FieldCheck {
  const v = raw.trim();
  if (!v) return { value: '', warnings: [] };
  if (/[^\d\s().+-]/u.test(v)) {
    return {
      error: `${label} can only contain digits, spaces, dashes, brackets and a leading + — "${v}" has other characters.`,
      warnings: [],
    };
  }
  // A leading bracket is how a country code is often written — "(+243) 812…" —
  // so the + counts as "at the start" when only brackets/spaces precede it.
  const head = v.replace(/^[\s(]+/u, '');
  const plus = head.startsWith('+');
  if ((plus ? head.slice(1) : head).includes('+')) {
    return { error: `${label} can have a single + only, at the start (e.g. +243 812 345 678).`, warnings: [] };
  }
  let digits = v.replace(/\D/gu, '');
  const international = plus || digits.startsWith('00');
  if (!plus && digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < PHONE_MIN_DIGITS) {
    return {
      error: `${label} is too short — ${digits.length} digit${digits.length === 1 ? '' : 's'}, a phone number has at least ${PHONE_MIN_DIGITS}.`,
      warnings: [],
    };
  }
  if (digits.length > PHONE_MAX_DIGITS) {
    return {
      error: `${label} is too long — ${digits.length} digits, an international number has at most ${PHONE_MAX_DIGITS}.`,
      warnings: [],
    };
  }
  if (!international) {
    return {
      value: digits,
      warnings: [`${label} has no country code — add it (e.g. +243 for DRC) so the number can be dialled from abroad.`],
    };
  }
  if (digits.startsWith('0')) {
    return { error: `${label}: a country code never starts with 0 — remove the 0 after the +.`, warnings: [] };
  }
  return { value: `+${digits}`, warnings: [] };
}

/** Digits only — how two phone numbers are compared for duplicates. */
export const phoneDigits = (v: string): string => v.replace(/\D/gu, '').replace(/^00/u, '');

// ─────────────────────────────────────────────────────────────────────────────
// Unusual values — warnings only
// ─────────────────────────────────────────────────────────────────────────────

/** How far from today a date may sit before it looks like a typo'd year. */
export const DATE_WARN_YEARS_BACK = 30;
export const DATE_WARN_YEARS_AHEAD = 20;

/**
 * A date the operator probably mistyped — 1926 for 2026, 2062 for 2026. Takes
 * the stored ISO form (`YYYY-MM-DD`); anything else is left to the date input.
 */
export function dateWarnings(iso: string, label: string, today = new Date()): string[] {
  const m = /^(\d{4})-\d{2}-\d{2}$/u.exec(iso.trim());
  if (!m) return [];
  const year = Number(m[1]);
  const now = today.getFullYear();
  if (year < now - DATE_WARN_YEARS_BACK) return [`${label} is in ${year}, more than ${DATE_WARN_YEARS_BACK} years ago — check the year.`];
  if (year > now + DATE_WARN_YEARS_AHEAD) return [`${label} is in ${year}, more than ${DATE_WARN_YEARS_AHEAD} years ahead — check the year.`];
  return [];
}

/** A zero or negative amount, weight or quantity — allowed, but rarely meant. */
export function numberWarnings(raw: unknown, label: string): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/gu, ''));
  if (!Number.isFinite(n)) return [];
  if (n < 0) return [`${label} is negative (${n}) — check the sign.`];
  if (n === 0) return [`${label} is 0 — leave it blank if the value is not known yet.`];
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// By field type — what the page runtime and the renderer call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check one value of a configurable-page field by its `field_type`. Returns
 * the normalised value to store for email / tel, any blocking error, and any
 * warnings. Types this module has no rule for pass through untouched.
 *
 * `pattern` is the field's configured regex (`props.pattern`), and
 * `patternMessage` its configured sentence (`props.patternMessage`), so a
 * pattern a business analyst adds to a field is enforced with words they chose
 * rather than "invalid format".
 */
export function checkFieldValue(
  fieldType: string,
  raw: unknown,
  label: string,
  opts: { maxLength?: number; pattern?: string; patternMessage?: string; warnUnusual?: boolean } = {},
): FieldCheck {
  if (raw === null || raw === undefined || raw === '') return { warnings: [] };

  if (fieldType === 'email') return checkEmail(String(raw), label, opts.maxLength ?? 100);
  if (fieldType === 'tel') return checkPhone(String(raw), label);

  const warnings: string[] = [];
  if (typeof raw === 'string' && opts.pattern) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(`^(?:${opts.pattern})$`, 'u');
    } catch {
      re = null; // a malformed configured pattern must not block every save
    }
    if (re && !re.test(raw.trim())) {
      return { error: opts.patternMessage ? `${label}: ${opts.patternMessage}` : `${label} is not in the expected format.`, warnings };
    }
  }
  if (opts.warnUnusual !== false) {
    if (fieldType === 'date' && typeof raw === 'string') warnings.push(...dateWarnings(raw, label));
    if (fieldType === 'number') warnings.push(...numberWarnings(raw, label));
  }
  return { warnings };
}

/**
 * The same email or phone number entered twice on ONE form — usually a
 * copy-paste slip (the secondary phone pasted over with the primary).
 * `fields` is [{ name, label, type, value }] for the form's email/tel fields.
 * Returns field name → warning, on the second occurrence.
 */
export function repeatedContactWarnings(
  fields: Array<{ name: string; label: string; type: string; value: unknown }>,
): Record<string, string> {
  const seen = new Map<string, string>();
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.type !== 'email' && f.type !== 'tel') continue;
    const v = typeof f.value === 'string' ? f.value.trim() : '';
    if (!v) continue;
    const key = f.type === 'tel' ? `tel:${phoneDigits(v)}` : `email:${v.toLowerCase()}`;
    const first = seen.get(key);
    if (first) out[f.name] = `${f.label} is the same as ${first} — was that intended?`;
    else seen.set(key, f.label);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod — the same rules at an API boundary (§4.7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared by both contact fields (§4.10). Three inputs, three meanings —
 * and keeping them apart is what makes it safe on an update schema:
 *
 *   undefined  — the field was NOT SENT. Stays undefined, so a `.partial()`
 *                update that omits it leaves the stored value alone. (Turning it
 *                into null would erase the client's email on every unrelated save.)
 *   '' / null  — the operator CLEARED it. Stored as null; refused if required.
 *   a string   — checked, refused with the shared sentence, or normalised.
 */
const contactInput = z.union([z.string(), z.null(), z.undefined()]);

/** Checks a non-empty value; adds the shared sentence as the issue on failure. */
function runCheck(check: (s: string) => FieldCheck, s: string, ctx: z.RefinementCtx): string {
  const r = check(s);
  if (r.error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
    return z.NEVER;
  }
  return r.value ?? s;
}

/** Required: always yields a checked string. Missing or blank is refused. */
function requiredContact(check: (s: string) => FieldCheck, label: string) {
  return contactInput.transform((v, ctx): string => {
    const s = (v ?? '').trim();
    if (!s) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required.` });
      return z.NEVER;
    }
    return runCheck(check, s, ctx);
  });
}

/** Optional: undefined = not sent (left alone), '' / null = cleared (null). */
function optionalContact(check: (s: string) => FieldCheck) {
  return contactInput.transform((v, ctx): string | null | undefined => {
    if (v === undefined) return undefined;
    const s = (v ?? '').trim();
    return s ? runCheck(check, s, ctx) : null;
  });
}

/**
 * An email field for a hand-written schema. Runs `checkEmail`, so a route and
 * a configurable page reject the same address with the same sentence, and
 * stores its normalised form. Add `.optional()` for an update that may leave it
 * out but must never blank it.
 */
export function emailField(label: string, opts?: { max?: number; optional?: false }): ReturnType<typeof requiredContact>;
export function emailField(label: string, opts: { max?: number; optional: true }): ReturnType<typeof optionalContact>;
export function emailField(label: string, opts: { max?: number; optional?: boolean } = {}) {
  const check = (s: string): FieldCheck => checkEmail(s, label, opts.max ?? 100);
  return opts.optional ? optionalContact(check) : requiredContact(check, label);
}

/** A phone field for a hand-written schema — `checkPhone`, normalised on the way in. */
export function phoneField(label: string, opts?: { optional?: false }): ReturnType<typeof requiredContact>;
export function phoneField(label: string, opts: { optional: true }): ReturnType<typeof optionalContact>;
export function phoneField(label: string, opts: { optional?: boolean } = {}) {
  const check = (s: string): FieldCheck => checkPhone(s, label);
  return opts.optional ? optionalContact(check) : requiredContact(check, label);
}
