import type { FormFieldRow } from '@/db/schema';
import { loadFieldValidation } from '@/lib/fieldValidations';
import { fieldValidationSchema, type FieldValidation } from './validation';

// Server-only validation_json resolver. Split out of ./validation.ts so the
// pure builders (buildFieldZodSchema / buildFormZodSchema) stay importable from
// client components — see DynamicForm.tsx — without dragging pg into the
// browser bundle.

/**
 * Inline the pattern + errorMessage from a field_validation_master_t row
 * referenced via `validation_json.validationKey`. If the field doesn't carry
 * a key (or carries no validation_json at all), it's returned unchanged.
 *
 * The merged shape lets buildFieldZodSchema stay synchronous and means the
 * client (DynamicForm) sees pattern + errorMessage in the form definition
 * it loads, so client-side messages match server-side ones.
 *
 * Locally-declared pattern / errorMessage take precedence — admins can
 * override a master pattern in one field without forking the row.
 */
export async function resolveValidationKey(field: FormFieldRow): Promise<FormFieldRow> {
  if (field.validationJson == null) return field;
  const parsed = fieldValidationSchema.safeParse(field.validationJson);
  if (!parsed.success || !parsed.data.validationKey) return field;

  const v = parsed.data;
  const master = await loadFieldValidation(v.validationKey!);
  const merged: FieldValidation = {
    ...v,
    pattern: v.pattern ?? master.pattern,
    errorMessage: v.errorMessage ?? master.errorMessage ?? undefined,
  };
  return { ...field, validationJson: merged };
}

/**
 * Resolve every field's validation_json via resolveValidationKey. Used by
 * loadForm so downstream consumers (buildFormZodSchema, DynamicForm) never
 * see unresolved validationKey references.
 */
export async function resolveValidationKeys(
  fields: FormFieldRow[],
): Promise<FormFieldRow[]> {
  return Promise.all(fields.map(resolveValidationKey));
}
