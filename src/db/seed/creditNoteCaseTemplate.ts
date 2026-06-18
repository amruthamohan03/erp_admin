import { eq, sql } from 'drizzle-orm';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Glue: credit_note_create form + credit_note_default workflow + credit_note_t
// target. Mirrors invoiceCaseTemplate — only the master keys change.

const TEMPLATE_KEY = 'credit_note_default';

export async function seedCreditNoteCaseTemplate(
  db: Database | Transaction,
): Promise<void> {
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, 'credit_note_create'))
    .limit(1);
  if (!form) {
    throw new Error(
      'seedCreditNoteCaseTemplate: form credit_note_create missing — run seedCreditNoteForm first',
    );
  }

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, 'credit_note_default'))
    .limit(1);
  if (!wf) {
    throw new Error(
      'seedCreditNoteCaseTemplate: workflow credit_note_default missing — run seedCreditNoteWorkflow first',
    );
  }

  await db
    .insert(caseTemplateMaster)
    .values({
      templateKey: TEMPLATE_KEY,
      name: 'Credit note (default)',
      description: 'Standard credit-note lifecycle, backed by credit_note_t.',
      entityType: 'credit_note',
      formId: form.id,
      workflowId: wf.id,
      targetTable: 'credit_note_t',
    })
    .onConflictDoUpdate({
      target: caseTemplateMaster.templateKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        entityType: sql`excluded.entity_type`,
        formId: sql`excluded.form_id`,
        workflowId: sql`excluded.workflow_id`,
        targetTable: sql`excluded.target_table`,
        updatedAt: sql`now()`,
      },
    });
}
