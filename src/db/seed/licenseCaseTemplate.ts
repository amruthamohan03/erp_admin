import { eq, sql } from 'drizzle-orm';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Case template tying the license form, license workflow, and the license_t
// target table together. After this seed runs, the case-runtime can drive
// the full lifecycle without any new code:
//
//   await createCase({ templateKey: 'license_default', actorUserId, values })
//   await advanceCase({ templateKey: 'license_default', caseId, transitionKey, actorUserId, payload })

const TEMPLATE_KEY = 'license_default';

export async function seedLicenseCaseTemplate(
  db: Database | Transaction,
): Promise<void> {
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, 'license_create'))
    .limit(1);
  if (!form) {
    throw new Error(
      'seedLicenseCaseTemplate: form license_create missing — run seedLicenseForm first',
    );
  }

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, 'license_default'))
    .limit(1);
  if (!wf) {
    throw new Error(
      'seedLicenseCaseTemplate: workflow license_default missing — run seedLicenseWorkflow first',
    );
  }

  await db
    .insert(caseTemplateMaster)
    .values({
      templateKey: TEMPLATE_KEY,
      name: 'License (default)',
      description:
        'Default workflow for issuing import/export licenses, backed by license_t.',
      entityType: 'license',
      formId: form.id,
      workflowId: wf.id,
      targetTable: 'license_t',
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
