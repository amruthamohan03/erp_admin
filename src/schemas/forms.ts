import { z } from 'zod';

// Boundary schemas for the form-definition admin endpoints
// (/api/v1/forms + nested /fields). Field types kept in sync with
// SUPPORTED_FIELD_TYPES in engine/forms/validation.ts — extending
// that list means extending this enum too.

const fieldTypeEnum = z.enum([
  'text',
  'textarea',
  'email',
  'password',
  'number',
  'date',
  'datetime',
  'checkbox',
  'select',
  'hidden',
]);
export type FormFieldType = z.infer<typeof fieldTypeEnum>;

// ── Form definition ──────────────────────────────────────────────

// form_key must be a stable slug — code reads forms by key
// (loadForm, buildFormZodSchema, DynamicForm), so renames break
// consumers. Enforce a conservative slug shape at the boundary.
const formKey = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*$/u,
    'Must be lowercase letters, digits, hyphens, underscores; must start with a letter.',
  );

export const formDefinitionCreateSchema = z.object({
  form_key: formKey,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  entity_type: z.string().min(1).max(100),
});
export type FormDefinitionCreate = z.infer<typeof formDefinitionCreateSchema>;

export const formDefinitionUpdateSchema = z.object({
  // form_key intentionally NOT editable — see the slug comment above.
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  entity_type: z.string().min(1).max(100).optional(),
});
export type FormDefinitionUpdate = z.infer<typeof formDefinitionUpdateSchema>;

// ── Form field ───────────────────────────────────────────────────

// field_key is required per-form-unique; the DB does not enforce
// (formId, fieldKey) uniqueness at the schema level today, so the
// POST handler checks explicitly and 409s on collision.
const fieldKey = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_]*$/u,
    'Must be snake_case: lowercase letters, digits, underscores; must start with a letter.',
  );

// validation_json / options_json accept any JSON — the engine
// (buildFieldZodSchema, DynamicForm) validates the token bag when
// it renders. Keeping the boundary lax here means adding a new
// validation token doesn't need a schema migration.
const jsonBlob = z.unknown().nullable().optional();

export const formFieldCreateSchema = z.object({
  field_key: fieldKey,
  label: z.string().min(1).max(255),
  field_type: fieldTypeEnum,
  required: z.boolean().optional(),
  default_value: z.string().nullable().optional(),
  help_text: z.string().nullable().optional(),
  validation_json: jsonBlob,
  options_json: jsonBlob,
  display_order: z.coerce.number().int().min(0).optional(),
});
export type FormFieldCreate = z.infer<typeof formFieldCreateSchema>;

export const formFieldUpdateSchema = formFieldCreateSchema.partial();
export type FormFieldUpdate = z.infer<typeof formFieldUpdateSchema>;
