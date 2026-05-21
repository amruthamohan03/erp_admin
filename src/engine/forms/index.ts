import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormDefinitionRow,
  type FormFieldRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Dynamic form runtime per root CLAUDE.md §4.5.
//
// `formKey` is the stable string identifier from form_definition_master_t.
// Code looks forms up by key, never id — same convention as the rule (§4.2)
// and workflow (§4.6) engines.
//
// The renderer is intentionally not implemented yet. Picking how to map
// `field_type` strings to React components — and how `validation_json` /
// `options_json` shape — is a design decision that should land alongside
// the first real dynamic form, not now.

export interface FormDefinitionWithFields extends FormDefinitionRow {
  fields: FormFieldRow[];
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

  return { ...form, fields };
}

// The renderer signature exists so callers can type-check against it, but
// the body throws — picking the field_type → component mapping deserves a
// real design conversation when the first form goes live.
export function renderForm(_form: FormDefinitionWithFields): never {
  throw new Error(
    `renderForm: no renderer is wired up yet. Pick the field_type → component ` +
      `mapping and validation_json format in src/engine/forms/.`,
  );
}
