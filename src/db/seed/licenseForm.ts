import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Form definition for creating a license — eight fields matching license_t.
//
// form_definition_master_t has a natural key (form_key) so it can be
// onConflictDoUpdate'd. form_field_master_t doesn't have a (form_id,
// field_key) unique constraint today, so we delete+reinsert the fields
// for this form_id to keep the seed deterministic. Safe for dev/test;
// if used against production a (form_id, field_key) unique index is the
// proper long-term fix.

const FORM_KEY = 'license_create';

export async function seedLicenseForm(db: Database | Transaction): Promise<void> {
  await db
    .insert(formDefinitionMaster)
    .values({
      formKey: FORM_KEY,
      name: 'Create license',
      description: 'Issue a new import or export license.',
      entityType: 'license',
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
    throw new Error(`seedLicenseForm: form '${FORM_KEY}' not found after upsert`);
  }

  const fields: FormFieldInsert[] = [
    {
      formId: form.id,
      fieldKey: 'license_no',
      label: 'License number',
      fieldType: 'text',
      required: true,
      helpText: 'Jurisdiction-specific. Letters, digits, hyphens; 3–30 chars.',
      validationJson: { pattern: '^[A-Z0-9-]{3,30}$', min: 3, max: 30 },
      displayOrder: 10,
    },
    {
      formId: form.id,
      fieldKey: 'client_id',
      label: 'Client',
      fieldType: 'number',
      required: true,
      helpText: 'Pick the client owning this license.',
      validationJson: { min: 1 },
      displayOrder: 20,
    },
    {
      formId: form.id,
      fieldKey: 'license_type_id',
      label: 'License type',
      fieldType: 'number',
      required: true,
      helpText: 'IB (Import) or Export — see license_type_master_t.',
      validationJson: { min: 1 },
      displayOrder: 30,
    },
    {
      formId: form.id,
      fieldKey: 'amount',
      label: 'Amount',
      fieldType: 'number',
      required: true,
      validationJson: { min: 0 },
      displayOrder: 40,
    },
    {
      formId: form.id,
      fieldKey: 'currency',
      label: 'Currency',
      fieldType: 'select',
      required: true,
      validationJson: { enum: ['USD', 'EUR', 'CDF'] },
      optionsJson: ['USD', 'EUR', 'CDF'],
      displayOrder: 50,
    },
    {
      formId: form.id,
      fieldKey: 'issue_date',
      label: 'Issue date',
      fieldType: 'date',
      required: false,
      displayOrder: 60,
    },
    {
      formId: form.id,
      fieldKey: 'expiry_date',
      label: 'Expiry date',
      fieldType: 'date',
      required: false,
      displayOrder: 70,
    },
    {
      formId: form.id,
      fieldKey: 'notes',
      label: 'Notes',
      fieldType: 'textarea',
      required: false,
      validationJson: { max: 1000 },
      displayOrder: 80,
    },
  ];

  await db.delete(formFieldMaster).where(eq(formFieldMaster.formId, form.id));
  await db.insert(formFieldMaster).values(fields);
}
