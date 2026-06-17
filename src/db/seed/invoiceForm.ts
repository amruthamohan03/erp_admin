import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// invoice_create form_definition + fields. Same pattern as license_create:
// upsert the form by form_key, then delete+reinsert the children since
// form_field_master_t has no natural unique constraint on
// (form_id, field_key).
//
// currency uses validationKey to reference iso.currency_code seeded in
// fieldValidations.ts — the resolved pattern + errorMessage flow through
// loadForm → buildFormZodSchema automatically.

const FORM_KEY = 'invoice_create';

export async function seedInvoiceForm(db: Database | Transaction): Promise<void> {
  await db
    .insert(formDefinitionMaster)
    .values({
      formKey: FORM_KEY,
      name: 'Create invoice',
      description: 'Issue an invoice against a client (optionally linked to a license).',
      entityType: 'invoice',
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
    throw new Error(`seedInvoiceForm: form '${FORM_KEY}' not found after upsert`);
  }

  const fields: FormFieldInsert[] = [
    {
      formId: form.id,
      fieldKey: 'invoice_number',
      label: 'Invoice number',
      fieldType: 'text',
      required: true,
      helpText: 'Jurisdiction-specific. Letters, digits, hyphens.',
      validationJson: { pattern: '^[A-Z0-9-]{3,30}$', min: 3, max: 30 },
      displayOrder: 10,
    },
    {
      formId: form.id,
      fieldKey: 'client_id',
      label: 'Client',
      fieldType: 'number',
      required: true,
      helpText: 'Pick the client this invoice is for.',
      validationJson: { min: 1 },
      displayOrder: 20,
    },
    {
      formId: form.id,
      fieldKey: 'license_id',
      label: 'License (optional)',
      fieldType: 'number',
      required: false,
      helpText: 'Link to the license this invoice clears, if any.',
      displayOrder: 30,
    },
    {
      formId: form.id,
      fieldKey: 'amount',
      label: 'Amount (excl. tax)',
      fieldType: 'number',
      required: true,
      validationJson: { min: 0 },
      displayOrder: 40,
    },
    {
      formId: form.id,
      fieldKey: 'tax',
      label: 'Tax amount',
      fieldType: 'number',
      required: false,
      validationJson: { min: 0 },
      helpText: 'Optional — leave blank to compute via the tax_rule master.',
      displayOrder: 50,
    },
    {
      formId: form.id,
      fieldKey: 'currency',
      label: 'Currency',
      fieldType: 'text',
      required: true,
      // Reference the seeded iso.currency_code validation — pattern +
      // errorMessage land in the rendered Zod schema automatically.
      validationJson: { validationKey: 'iso.currency_code' },
      displayOrder: 60,
    },
    {
      formId: form.id,
      fieldKey: 'issue_date',
      label: 'Issue date',
      fieldType: 'date',
      required: false,
      displayOrder: 70,
    },
    {
      formId: form.id,
      fieldKey: 'due_date',
      label: 'Due date',
      fieldType: 'date',
      required: false,
      displayOrder: 80,
    },
    {
      formId: form.id,
      fieldKey: 'notes',
      label: 'Notes',
      fieldType: 'textarea',
      required: false,
      validationJson: { max: 1000 },
      displayOrder: 90,
    },
  ];

  await db.delete(formFieldMaster).where(eq(formFieldMaster.formId, form.id));
  await db.insert(formFieldMaster).values(fields);
}
