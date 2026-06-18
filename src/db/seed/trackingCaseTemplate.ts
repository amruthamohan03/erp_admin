import { eq, sql } from 'drizzle-orm';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Glue: tracking_create form + tracking_default workflow + tracking_t
// target. Mirrors invoiceCaseTemplate / creditNoteCaseTemplate exactly —
// only the master keys change.

const TEMPLATE_KEY = 'tracking_default';

export async function seedTrackingCaseTemplate(
  db: Database | Transaction,
): Promise<void> {
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, 'tracking_create'))
    .limit(1);
  if (!form) {
    throw new Error(
      'seedTrackingCaseTemplate: form tracking_create missing — run seedTrackingForm first',
    );
  }

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, 'tracking_default'))
    .limit(1);
  if (!wf) {
    throw new Error(
      'seedTrackingCaseTemplate: workflow tracking_default missing — run seedTrackingWorkflow first',
    );
  }

  await db
    .insert(caseTemplateMaster)
    .values({
      templateKey: TEMPLATE_KEY,
      name: 'Tracking (default)',
      description: 'Standard tracking lifecycle, backed by tracking_t.',
      entityType: 'tracking',
      formId: form.id,
      workflowId: wf.id,
      targetTable: 'tracking_t',
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
