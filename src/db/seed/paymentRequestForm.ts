import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// payment_request_create form_definition + fields.

const FORM_KEY = 'payment_request_create';

export async function seedPaymentRequestForm(
  db: Database | Transaction,
): Promise<void> {
  await db
    .insert(formDefinitionMaster)
    .values({
      formKey: FORM_KEY,
      name: 'Create payment request',
      description:
        'Submit a payment request that requires multi-stage approval (Dept Head → Finance → CEO).',
      entityType: 'payment_request',
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
    throw new Error(`seedPaymentRequestForm: form '${FORM_KEY}' not found after upsert`);
  }

  const fields: FormFieldInsert[] = [
    {
      formId: form.id,
      fieldKey: 'request_number',
      label: 'Request number',
      fieldType: 'text',
      required: true,
      helpText: 'Letters, digits, hyphens.',
      validationJson: { pattern: '^[A-Z0-9-]{3,30}$', min: 3, max: 30 },
      displayOrder: 10,
    },
    {
      formId: form.id,
      fieldKey: 'client_id',
      label: 'Client (optional)',
      fieldType: 'number',
      required: false,
      displayOrder: 20,
    },
    {
      formId: form.id,
      fieldKey: 'invoice_id',
      label: 'Invoice (optional)',
      fieldType: 'number',
      required: false,
      helpText: 'Link to the invoice this payment settles, if any.',
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
      fieldType: 'text',
      required: true,
      validationJson: { validationKey: 'iso.currency_code' },
      displayOrder: 50,
    },
    {
      formId: form.id,
      fieldKey: 'purpose',
      label: 'Purpose',
      fieldType: 'text',
      required: true,
      validationJson: { max: 255 },
      helpText: 'One-line summary shown to approvers.',
      displayOrder: 60,
    },
    {
      formId: form.id,
      fieldKey: 'due_date',
      label: 'Due date',
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
