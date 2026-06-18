import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormDefinitionRow,
  type FormFieldRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';
import { resolveValidationKeys } from './resolveValidation';

export * from './validation';
export { resolveValidationKey, resolveValidationKeys } from './resolveValidation';

// Dynamic form runtime per root CLAUDE.md §4.5.
//
// `formKey` is the stable string identifier from form_definition_master_t.
// Code looks forms up by key, never id — same convention as the rule (§4.2)
// and workflow (§4.6) engines.
//
// Validation: buildFieldZodSchema / buildFormZodSchema in ./validation
// translate a form definition into a Zod schema that case-runtime uses to
// validate createCase / advanceCase input.
//
// Rendering: the <DynamicForm> React component in ./DynamicForm.tsx wires
// each field_type to a UI primitive (Input/Textarea/Switch/SearchableSelect)
// and uses the same buildFormZodSchema for client-side validation before
// hitting the server. Import it directly:
//
//   import { DynamicForm } from '@/engine/forms/DynamicForm';
//
// Not re-exported here because this index module is server-safe and we don't
// want a stray 'use client' to land in server bundles.

/**
 * A form field plus its grant-resolved permission for the current actor.
 * `permission` is optional so existing consumers (tests, integration paths
 * that don't go through the route) keep working with plain FormFieldRow[].
 * When present, 'view' means render the input disabled and skip from
 * client-side validation / submission; 'edit' is the default behavior.
 */
export type FormFieldWithPermission = FormFieldRow & {
  permission?: 'view' | 'edit';
};

export interface FormDefinitionWithFields extends FormDefinitionRow {
  fields: FormFieldWithPermission[];
}

export async function loadForm(formKey: string): Promise<FormDefinitionWithFields> {
  const [form] = await db
    .select()
    .from(formDefinitionMaster)
    .where(
      and(
        eq(formDefinitionMaster.formKey, formKey),
        eq(formDefinitionMaster.display, 'Y'),
      ),
    )
    .limit(1);
  if (!form) throw new NotFoundError(`Form not found: ${formKey}`);

  const fields = await db
    .select()
    .from(formFieldMaster)
    .where(
      and(
        eq(formFieldMaster.formId, form.id),
        eq(formFieldMaster.display, 'Y'),
      ),
    )
    .orderBy(asc(formFieldMaster.displayOrder), asc(formFieldMaster.id));

  // Inline any validation_json.validationKey references against
  // field_validation_master_t so downstream consumers (buildFormZodSchema,
  // DynamicForm) only see resolved patterns / errorMessages.
  const resolved = await resolveValidationKeys(fields);
  return { ...form, fields: resolved };
}

