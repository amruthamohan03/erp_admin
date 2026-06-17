import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  fieldValidationMaster,
  type FieldValidationMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Reusable string validations backed by field_validation_master_t. The
// stable `validation_key` is what admins / form definitions reference; the
// pattern is a JavaScript-compatible regex stored verbatim.
//
// Today this is a standalone lookup. The natural follow-up is to extend
// form_field_master_t.validation_json so it can carry
// `{ "validationKey": "drc.phone" }` and have buildFieldZodSchema resolve
// it server-side. That's a small extension and is left for a follow-up so
// the schema layer can land now without touching the forms runtime.

export async function loadFieldValidation(
  key: string,
): Promise<FieldValidationMasterRow> {
  const [row] = await db
    .select()
    .from(fieldValidationMaster)
    .where(
      and(
        eq(fieldValidationMaster.validationKey, key),
        eq(fieldValidationMaster.display, 'Y'),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError(`Field validation not found: ${key}`);
  return row;
}

export interface ValidationResult {
  ok: boolean;
  /** error_message from the master row when the check fails, else undefined. */
  message?: string;
}

/**
 * Run a string against one named validation. Throws NotFoundError if the
 * validation_key doesn't exist; returns { ok, message } once it's resolved.
 *
 * The regex is built without flags — admins can include flags in the
 * pattern itself via inline modifiers like `(?i)` if Postgres-stored values
 * need case insensitivity. Avoiding flags here keeps the pattern column the
 * complete source of truth.
 */
export async function isValid(
  key: string,
  value: string,
): Promise<ValidationResult> {
  const row = await loadFieldValidation(key);
  const re = new RegExp(row.pattern);
  if (re.test(value)) return { ok: true };
  return { ok: false, message: row.errorMessage ?? `${row.name} doesn't match` };
}
