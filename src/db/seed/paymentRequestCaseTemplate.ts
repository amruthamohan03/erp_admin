import { eq, sql } from 'drizzle-orm';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Glue: payment_request_create form + payment_request_default workflow +
// payment_request_t target.

const TEMPLATE_KEY = 'payment_request_default';

export async function seedPaymentRequestCaseTemplate(
  db: Database | Transaction,
): Promise<void> {
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, 'payment_request_create'))
    .limit(1);
  if (!form) {
    throw new Error(
      'seedPaymentRequestCaseTemplate: form payment_request_create missing — run seedPaymentRequestForm first',
    );
  }

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, 'payment_request_default'))
    .limit(1);
  if (!wf) {
    throw new Error(
      'seedPaymentRequestCaseTemplate: workflow payment_request_default missing — run seedPaymentRequestWorkflow first',
    );
  }

  await db
    .insert(caseTemplateMaster)
    .values({
      templateKey: TEMPLATE_KEY,
      name: 'Payment request (default)',
      description: 'Three-stage approval workflow backed by payment_request_t.',
      entityType: 'payment_request',
      formId: form.id,
      workflowId: wf.id,
      targetTable: 'payment_request_t',
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
