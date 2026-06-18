import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// credit_note_create form_definition + fields. Same upsert+delete-then-reinsert
// pattern as invoiceForm — form_field_master_t has no natural unique on
// (form_id, field_key).
//
// currency reuses the seeded iso.currency_code validation. invoice_id and
// client_id are number inputs today; a follow-up can swap them for entity
// pickers once the masters UI surfaces an /api/v1/invoices?q=… search.

const FORM_KEY = 'credit_note_create';

export async function seedCreditNoteForm(db: Database | Transaction): Promise<void> {
  await db
    .insert(formDefinitionMaster)
    .values({
      formKey: FORM_KEY,
      name: 'Create credit note',
      description: 'Issue a credit note against an existing invoice.',
      entityType: 'credit_note',
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
    throw new Error(`seedCreditNoteForm: form '${FORM_KEY}' not found after upsert`);
  }

  const fields: FormFieldInsert[] = [
    {
      formId: form.id,
      fieldKey: 'credit_note_number',
      label: 'Credit note number',
      fieldType: 'text',
      required: true,
      helpText: 'Jurisdiction-specific. Letters, digits, hyphens.',
      validationJson: { pattern: '^[A-Z0-9-]{3,30}$', min: 3, max: 30 },
      displayOrder: 10,
    },
    {
      formId: form.id,
      fieldKey: 'invoice_id',
      label: 'Invoice',
      fieldType: 'number',
      required: true,
      helpText: 'The invoice this credit note adjusts.',
      validationJson: { min: 1 },
      displayOrder: 20,
    },
    {
      formId: form.id,
      fieldKey: 'client_id',
      label: 'Client',
      fieldType: 'number',
      required: true,
      helpText: 'Should match the invoice client. Stored denormalized for filtering.',
      validationJson: { min: 1 },
      displayOrder: 30,
    },
    {
      formId: form.id,
      fieldKey: 'amount',
      label: 'Credit amount',
      fieldType: 'number',
      required: true,
      validationJson: { min: 0 },
      displayOrder: 40,
    },
    {
      formId: form.id,
      fieldKey: 'currency',
      label: 'Currency',
      fieldType: 'text',
      required: true,
      validationJson: { validationKey: 'iso.currency_code' },
      displayOrder: 50,
    },
    {
      formId: form.id,
      fieldKey: 'reason',
      label: 'Reason',
      fieldType: 'textarea',
      required: true,
      helpText: 'Why is this credit being issued? Visible on the credit note document.',
      validationJson: { min: 5, max: 1000 },
      displayOrder: 60,
    },
    {
      formId: form.id,
      fieldKey: 'issued_date',
      label: 'Issued date',
      fieldType: 'date',
      required: false,
      displayOrder: 70,
    },
    {
      formId: form.id,
      fieldKey: 'notes',
      label: 'Internal notes',
      fieldType: 'textarea',
      required: false,
      validationJson: { max: 1000 },
      displayOrder: 80,
    },
  ];

  await db.delete(formFieldMaster).where(eq(formFieldMaster.formId, form.id));
  await db.insert(formFieldMaster).values(fields);
}
