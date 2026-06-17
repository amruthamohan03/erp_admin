import { eq, sql } from 'drizzle-orm';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Glue: invoice_create form + invoice_default workflow + invoice_t target.
// Mirrors licenseCaseTemplate exactly — the case-runtime is genuinely
// entity-agnostic and only the master keys change.

const TEMPLATE_KEY = 'invoice_default';

export async function seedInvoiceCaseTemplate(
  db: Database | Transaction,
): Promise<void> {
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, 'invoice_create'))
    .limit(1);
  if (!form) {
    throw new Error(
      'seedInvoiceCaseTemplate: form invoice_create missing — run seedInvoiceForm first',
    );
  }

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, 'invoice_default'))
    .limit(1);
  if (!wf) {
    throw new Error(
      'seedInvoiceCaseTemplate: workflow invoice_default missing — run seedInvoiceWorkflow first',
    );
  }

  await db
    .insert(caseTemplateMaster)
    .values({
      templateKey: TEMPLATE_KEY,
      name: 'Invoice (default)',
      description: 'Standard invoice lifecycle, backed by invoice_t.',
      entityType: 'invoice',
      formId: form.id,
      workflowId: wf.id,
      targetTable: 'invoice_t',
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
