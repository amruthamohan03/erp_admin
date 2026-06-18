import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// tracking_create form_definition + fields. Same upsert+delete-then-reinsert
// pattern as invoiceForm — form_field_master_t has no natural unique on
// (form_id, field_key).
//
// license_id pins the tracking run to a license; template_id selects the
// milestone chain (Import vs Export). A follow-up can swap these for
// SearchableSelect entity pickers once the corresponding /api/v1/licenses
// and /api/v1/tracking-templates endpoints exist.

const FORM_KEY = 'tracking_create';

export async function seedTrackingForm(db: Database | Transaction): Promise<void> {
  await db
    .insert(formDefinitionMaster)
    .values({
      formKey: FORM_KEY,
      name: 'Create tracking run',
      description: 'Start a consignment tracking run against a license.',
      entityType: 'tracking',
    })
    .onConflictDoUpdate({
      target: formDefinitionMaster.formKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        entityType: sql`excluded.entity_type`,
        updatedAt: sql`now()`,
      },
    });

  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, FORM_KEY))
    .limit(1);
  if (!form) {
    throw new Error(`seedTrackingForm: form '${FORM_KEY}' not found after upsert`);
  }

  const fields: FormFieldInsert[] = [
    {
      formId: form.id,
      fieldKey: 'tracking_number',
      label: 'Tracking number',
      fieldType: 'text',
      required: true,
      helpText: 'Jurisdiction-specific. Letters, digits, hyphens.',
      validationJson: { pattern: '^[A-Z0-9-]{3,30}$', min: 3, max: 30 },
      displayOrder: 10,
    },
    {
      formId: form.id,
      fieldKey: 'license_id',
      label: 'License',
      fieldType: 'number',
      required: true,
      helpText: 'The license this tracking run is for.',
      validationJson: { min: 1 },
      displayOrder: 20,
    },
    {
      formId: form.id,
      fieldKey: 'template_id',
      label: 'Tracking template',
      fieldType: 'number',
      required: true,
      helpText:
        'tracking_template_master_t.id — picks the milestone chain (Import vs Export).',
      validationJson: { min: 1 },
      displayOrder: 30,
    },
    {
      formId: form.id,
      fieldKey: 'notes',
      label: 'Notes',
      fieldType: 'textarea',
      required: false,
      validationJson: { max: 1000 },
      displayOrder: 40,
    },
  ];

  await db.delete(formFieldMaster).where(eq(formFieldMaster.formId, form.id));
  await db.insert(formFieldMaster).values(fields);
}
