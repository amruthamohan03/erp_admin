import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  caseTemplateMaster,
  formDefinitionMaster,
  workflowMaster,
  type CaseTemplateRow,
  type FormDefinitionRow,
  type WorkflowMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Template loader per root CLAUDE.md §4.3.
//
// `templateKey` is the stable string from case_template_master_t.template_key.
// Loading also resolves the joined form_definition_master_t and
// workflow_master_t rows so the case runtime can hand them straight to
// engine/forms and engine/workflow.

export interface LoadedTemplate {
  template: CaseTemplateRow;
  form: FormDefinitionRow;
  workflow: WorkflowMasterRow;
}

export async function loadTemplate(templateKey: string): Promise<LoadedTemplate> {
  const [row] = await db
    .select({
      template: caseTemplateMaster,
      form: formDefinitionMaster,
      workflow: workflowMaster,
    })
    .from(caseTemplateMaster)
    .innerJoin(formDefinitionMaster, eq(formDefinitionMaster.id, caseTemplateMaster.formId))
    .innerJoin(workflowMaster, eq(workflowMaster.id, caseTemplateMaster.workflowId))
    .where(
      and(
        eq(caseTemplateMaster.templateKey, templateKey),
        eq(caseTemplateMaster.display, 'Y'),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError(`Case template not found: ${templateKey}`);
  return row;
}
