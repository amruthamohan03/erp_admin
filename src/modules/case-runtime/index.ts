import { loadTemplate, type LoadedTemplate } from '@/engine/templates';
import { loadForm } from '@/engine/forms';
import { listTransitions } from '@/engine/workflow';

// Generic case runtime per root CLAUDE.md §4.3.
//
// Templates (case_template_master_t) wire a form, a workflow, and a target
// table together. The runtime orchestrates the lifecycle:
//
//   1. createCase  — render the form, validate input, insert a row in
//                    target_table with state = workflow.initial_state.
//   2. advanceCase — run the workflow transition (rule gate, action_json
//                    side effects, state column update).
//
// Both operations are skeleton-only today. Wiring them up needs:
//   - A picked validation_json format (§4.5)
//   - A picked rule_json format and evaluator (§4.2)
//   - A picked action_json format and executor (§4.6)
//   - A way to write to an arbitrary target_table via Drizzle (the spec
//     forbids raw pg, so we need a registry or a sql-tag based write).
//
// Until those decisions are made the runtime fails loud so callers can't
// quietly skip half the lifecycle.

export interface CreateCaseInput {
  templateKey: string;
  actorUserId: number;
  values: Record<string, unknown>;
}

export interface AdvanceCaseInput {
  templateKey: string;
  caseId: number;
  transitionKey: string;
  actorUserId: number;
  payload?: Record<string, unknown>;
}

export async function describeTemplate(templateKey: string): Promise<{
  template: LoadedTemplate['template'];
  form: LoadedTemplate['form'];
  workflow: LoadedTemplate['workflow'];
  fieldCount: number;
  initialTransitions: number;
}> {
  const loaded = await loadTemplate(templateKey);
  const form = await loadForm(loaded.form.formKey);
  const initial = await listTransitions(loaded.workflow.workflowKey, loaded.workflow.initialState);
  return {
    template: loaded.template,
    form,
    workflow: loaded.workflow,
    fieldCount: form.fields.length,
    initialTransitions: initial.length,
  };
}

export async function createCase(_input: CreateCaseInput): Promise<never> {
  throw new Error(
    `createCase: case runtime is scaffold-only. Implement target_table writes ` +
      `(via Drizzle registry or sql-tag) and field validation in ` +
      `src/modules/case-runtime/.`,
  );
}

export async function advanceCase(_input: AdvanceCaseInput): Promise<never> {
  throw new Error(
    `advanceCase: case runtime is scaffold-only. Implement workflow ` +
      `transition application (rule gate, action_json executor, state ` +
      `column update) in src/modules/case-runtime/.`,
  );
}
