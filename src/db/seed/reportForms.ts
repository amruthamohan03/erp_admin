import { eq, sql } from 'drizzle-orm';
import {
  formDefinitionMaster,
  formFieldMaster,
  type FormFieldInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Parameter forms for reports that take inputs. Reuses the existing
// form_definition_master_t + form_field_master_t infrastructure rather
// than growing a parallel report_parameter table.
//
// Each form gets its entity_type set to 'report' — the report runner uses
// the form key (not entity_type) for lookup, but the entity_type keeps
// future-Drizzle Studio greps for "what is this form for" sane.

interface SeedForm {
  formKey: string;
  name: string;
  description: string;
  fields: FormFieldInsert[];
}

const FORMS: Array<Omit<SeedForm, 'fields'> & {
  buildFields: (formId: number) => FormFieldInsert[];
}> = [
  {
    formKey: 'report_invoices_outstanding_params',
    name: 'Outstanding invoices parameters',
    description: 'Cut-off date for the "invoices outstanding" report.',
    buildFields: (formId) => [
      {
        formId,
        fieldKey: 'max_due_date',
        label: 'Due on or before',
        fieldType: 'date',
        required: true,
        helpText: 'Cut-off — invoices due after this date are excluded.',
        displayOrder: 10,
      },
    ],
  },
  {
    formKey: 'report_tracking_in_progress_params',
    name: 'Tracking in progress parameters',
    description: 'Optional license-type filter.',
    buildFields: (formId) => [
      {
        formId,
        fieldKey: 'license_type_id',
        label: 'License type (optional)',
        fieldType: 'number',
        required: false,
        helpText: 'license_type_master_t.id — leave blank to include all.',
        validationJson: { min: 1 },
        displayOrder: 10,
      },
    ],
  },
];

export async function seedReportForms(db: Database | Transaction): Promise<void> {
  for (const form of FORMS) {
    await db
      .insert(formDefinitionMaster)
      .values({
        formKey: form.formKey,
        name: form.name,
        description: form.description,
        entityType: 'report',
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

    const [defn] = await db
      .select({ id: formDefinitionMaster.id })
      .from(formDefinitionMaster)
      .where(eq(formDefinitionMaster.formKey, form.formKey))
      .limit(1);
    if (!defn) {
      throw new Error(
        `seedReportForms: form '${form.formKey}' not found after upsert`,
      );
    }

    await db
      .delete(formFieldMaster)
      .where(eq(formFieldMaster.formId, defn.id));
    await db.insert(formFieldMaster).values(form.buildFields(defn.id));
  }
}
