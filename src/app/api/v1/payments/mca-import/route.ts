import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { parseRefSheet } from '@/lib/xlsxRead';
import { validateRefs } from '@/db/queries/paymentMca';

// POST /api/v1/payments/mca-import
//   (multipart: file=<.xlsx>, client_id, pay_for, expense_type, payment_id?)
//
// Parses a spreadsheet of references into grid lines and RETURNS them — it
// writes nothing. The operator still sees the rows, fills or corrects the
// amounts, and saves, exactly as if they had typed them. An import that silently
// committed would be the one path into this grid that skips the existence and
// duplicate checks every other path runs (§4.37's "guard every door", applied to
// input rather than to a resource).
//
// So the checks run HERE too, on the same `validateRefs` the typed path and the
// save-time guard use (§4.10) — a spreadsheet is the one source where a whole
// page of wrong references arrives at once, and finding that out at Save is too
// late to tell which of forty rows is the problem. Every line comes back with a
// verdict; the grid colours them and the operator fixes the red ones.
//
// Invalid rows are returned, not dropped. An import that silently skips rows is
// one an operator cannot reconcile against the sheet they sent.
//
// It carries no payment id in the PATH because it writes nothing, and the grid it
// feeds is part of the transaction form — an operator imports references on
// /payments/new, before a request exists to hang the route off. `payment_id` is
// a field instead, excluding the request being edited from its own duplicate check.

/** 2 MB. A reference list is a few hundred short rows; anything larger is not one. */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['.xlsx', '.xlsm'];

/** Other (3) / Pre Payment (4) generate their references — nothing to import against. */
const AUTO_REF_CATEGORIES = [3, 4];

function intField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const form = await req.formData().catch(() => null);
  if (!form) {
    throw new BadRequestError('The import must be sent as a file upload.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new BadRequestError('Choose a spreadsheet to import.');
  }

  // The same three fields the Select picker asks for, in the same order and with
  // the same reasons — a reference cannot be checked for existence without the
  // client and the category, nor for the one-to-one claim without the expense
  // type. Refusing here rather than importing unchecked rows keeps the file and
  // the typed path under one rule (§4.23 names the field either way).
  const clientId = intField(form, 'client_id');
  const payFor = intField(form, 'pay_for');
  const expenseType = intField(form, 'expense_type');
  const paymentId = intField(form, 'payment_id');

  if (clientId === null) {
    throw new BadRequestError('Select a Client before importing — each reference is checked against that client’s tracking files.');
  }
  if (payFor === null) {
    throw new BadRequestError('Select Payment For before importing — it decides which tracking table the references are checked against.');
  }
  if (expenseType === null) {
    throw new BadRequestError('Select an Expense Type before importing — each reference can be claimed once per expense type.');
  }
  if (AUTO_REF_CATEGORIES.includes(payFor)) {
    throw new BadRequestError('References for this Payment For are generated from the location, not imported. Use Generate instead.');
  }

  // §4.23 — name the file, the limit and the actual size, not "file too large".
  if (file.size === 0) {
    throw new BadRequestError(`“${file.name}” is empty.`);
  }
  if (file.size > MAX_BYTES) {
    throw new BadRequestError(
      `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB.`,
    );
  }

  // Extension only: exceljs rejects anything that is not really a workbook when
  // it parses, so this check exists to give a readable message first rather than
  // to be the security boundary.
  const lower = file.name.toLowerCase();
  if (!ACCEPTED.some((ext) => lower.endsWith(ext))) {
    const got = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : 'no extension';
    throw new BadRequestError(
      `References import accepts ${ACCEPTED.join(' or ')} — “${file.name}” is ${got}. Save the sheet as .xlsx and try again.`,
    );
  }

  let parsed;
  try {
    parsed = await parseRefSheet(await file.arrayBuffer());
  } catch {
    // exceljs throws its own low-level errors; none of them mean anything to an
    // operator, so they become one sentence about the file (§4.23).
    throw new BadRequestError(
      `“${file.name}” could not be read as a spreadsheet. Re-save it as .xlsx and try again.`,
    );
  }

  if (parsed.lines.length === 0) {
    throw new BadRequestError(
      `No references found in “${file.name}”. Put the reference in the first column and the amount in the second.`,
    );
  }

  // Both checks, in ONE pass over the whole sheet — the same helper the typed
  // path debounces against and the save-time guard re-runs (§4.10). Two queries
  // for forty rows, not two per row.
  const verdicts = await validateRefs({
    refs: parsed.lines.map((l) => l.ref),
    payFor,
    clientId,
    expenseType,
    paymentId,
  });
  const byRef = new Map(verdicts.map((v) => [v.mca_ref.trim().toUpperCase(), v]));

  const lines = parsed.lines.map((l) => {
    const v = byRef.get(l.ref.trim().toUpperCase());
    return {
      mca_ref: l.ref,
      amount: l.amount,
      // A reference the checker never saw is reported as failing rather than as
      // passing. An unknown verdict rendered green would be the one way a bad
      // row reaches Save wearing the colour that says it is fine.
      exists: v?.exists ?? false,
      duplicate: v?.duplicate ?? null,
      valid: v?.valid ?? false,
    };
  });

  const missing = lines.filter((l) => !l.exists).map((l) => l.mca_ref);
  const claimed = lines.filter((l) => l.exists && l.duplicate !== null);

  return ok({
    lines,
    blank: parsed.blank,
    duplicates: parsed.duplicates,
    header_skipped: parsed.headerSkipped,
    file_name: file.name,
    valid_count: lines.filter((l) => l.valid).length,
    // Named, not just counted: "3 references were rejected" sends the operator
    // back to the spreadsheet to find out which (§4.23). Capped so a sheet where
    // every row is wrong produces a sentence rather than a wall of text — the
    // grid colours all of them anyway.
    not_found: missing,
    already_claimed: claimed.map((l) => ({ mca_ref: l.mca_ref, payment_id: l.duplicate })),
  });
});
