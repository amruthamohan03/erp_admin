import { z } from 'zod';
import type { FormFieldRow } from '@/db/schema';

// validation_json format for form_field_master_t per root CLAUDE.md §4.5.
//
// A small token set that's expressive enough for the common cases without
// turning into a full Zod-to-JSON translator. Each field carries an optional
// validation_json blob; missing tokens fall back to sensible defaults from
// the field_type. The field_master row's `required` column is the default —
// validation_json.required overrides it.
//
// Examples in rule_json style:
//   { "required": true, "min": 3, "max": 255 }
//   { "pattern": "^[A-Z]{2,3}$" }                // license type code
//   { "enum": ["IB", "Export"] }                  // alternative to options_json
//
// Cross-field validation isn't handled here — wire it through the rule
// engine (§4.2) as a separate row in rule_master_t once it's needed.

export const fieldValidationSchema = z.object({
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
});

export type FieldValidation = z.infer<typeof fieldValidationSchema>;

// Field types the validation builder understands. Adding a new type means
// adding a case in buildFieldZodSchema below — keeping the runtime as the
// source-of-truth for what's supported (cf. forms schema comment).
const SUPPORTED_FIELD_TYPES = [
  'text', 'textarea', 'email', 'password',
  'number', 'date', 'datetime',
  'checkbox', 'select', 'hidden',
] as const;
export type SupportedFieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

function parseValidation(field: FormFieldRow): FieldValidation {
  if (field.validationJson == null) return {};
  return fieldValidationSchema.parse(field.validationJson);
}

/**
 * Build a Zod schema for one form_field_master_t row. The schema enforces
 * field_type's natural shape (string, number, boolean, …) plus whatever the
 * validation_json blob declares.
 */
export function buildFieldZodSchema(field: FormFieldRow): z.ZodTypeAny {
  const v = parseValidation(field);
  const required = v.required ?? field.required;

  let base: z.ZodTypeAny;
  switch (field.fieldType) {
    case 'text':
    case 'textarea':
    case 'password': {
      let s = z.string();
      if (v.min !== undefined) s = s.min(v.min);
      if (v.max !== undefined) s = s.max(v.max);
      if (v.pattern !== undefined) s = s.regex(new RegExp(v.pattern));
      base = s;
      break;
    }
    case 'email': {
      let s = z.string().email();
      if (v.max !== undefined) s = s.max(v.max);
      base = s;
      break;
    }
    case 'number': {
      let n = z.number();
      if (v.min !== undefined) n = n.min(v.min);
      if (v.max !== undefined) n = n.max(v.max);
      base = n;
      break;
    }
    case 'date':
    case 'datetime': {
      // Wire-format is ISO-8601 strings; the renderer can convert to/from
      // Date objects at the UI boundary.
      base = z.string().min(1);
      break;
    }
    case 'checkbox':
      base = z.boolean();
      break;
    case 'select':
    case 'hidden': {
      if (v.enum && v.enum.length > 0) {
        // Select / hidden are commonly enums of strings — accept any value
        // in the enum without forcing a string type so options_json can carry
        // numeric ids if the field references another table.
        const allowed = v.enum;
        base = z.unknown().refine(
          (val) => allowed.includes(val),
          { message: `Must be one of: ${allowed.map(String).join(', ')}` },
        );
      } else {
        base = z.unknown();
      }
      break;
    }
    default: {
      const t: never = field.fieldType as never;
      throw new Error(
        `buildFieldZodSchema: unsupported field_type "${t}" — extend SUPPORTED_FIELD_TYPES + the switch above.`,
      );
    }
  }

  // Apply requiredness last. For optional fields, empty strings and null are
  // both acceptable (UI often submits one or the other for empty inputs).
  if (!required) {
    return base.optional().nullable();
  }
  return base;
}

/**
 * Build a ZodObject schema for an entire form definition. Field order is
 * preserved by Zod but doesn't matter for validation.
 */
export function buildFormZodSchema(fields: FormFieldRow[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    shape[f.fieldKey] = buildFieldZodSchema(f);
  }
  return z.object(shape);
}
