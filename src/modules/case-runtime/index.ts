import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loadTemplate, type LoadedTemplate } from '@/engine/templates';
import { loadForm, buildFormZodSchema } from '@/engine/forms';
import {
  executeTransition,
  listTransitions,
  type SideEffectDescriptor,
} from '@/engine/workflow';
import type { WorkflowTransitionMasterRow } from '@/db/schema';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { enqueueNotifications } from '@/lib/notifications';
import { fetchFieldGrants, writableFieldIds } from '@/lib/formFieldGrants';

// Generic case runtime per root CLAUDE.md §4.3.
//
// Templates (case_template_master_t) wire a form, a workflow, and a target
// table together. The runtime orchestrates the lifecycle:
//
//   createCase  — insert a row in template.target_table with state =
//                 workflow.initial_state. Field validation against the form
//                 definition is the caller's responsibility today (per-field
//                 validation_json format isn't picked yet, §4.5).
//   advanceCase — read the entity, validate from_state matches, run the
//                 transition (gate + actions via @/engine/workflow), splice
//                 patch + state + audit into one UPDATE.
//
// Dynamic target_table access uses Drizzle's sql tag with sql.identifier
// (§7.6 — no raw pg). Multi-statement work is wrapped in db.transaction
// per §7.3.

export interface CreateCaseInput {
  templateKey: string;
  actorUserId: number;
  /**
   * Required so field-level role grants can enforce write permission before
   * Zod validation runs. Without it a hostile client could smuggle writes to
   * view/hidden fields by posting extra keys. See [src/lib/formFieldGrants.ts].
   */
  actorRoleId: number;
  /** Column → value map. Validated by the caller until §4.5 forms is real. */
  values: Record<string, unknown>;
}

export interface CreateCaseResult {
  caseId: number;
  templateKey: string;
  state: string;
}

export interface AdvanceCaseInput {
  templateKey: string;
  caseId: number;
  transitionKey: string;
  actorUserId: number;
  actorRoleId: number;
  payload?: Record<string, unknown>;
}

export interface AdvanceCaseResult {
  caseId: number;
  templateKey: string;
  workflowKey: string;
  transitionKey: string;
  previousState: string;
  newState: string;
  /** Notify / outbox descriptors — the caller dispatches after this returns. */
  sideEffects: SideEffectDescriptor[];
}

export interface ListCasesInput {
  templateKey: string;
  /** 1-based. Defaults to 1. */
  page?: number;
  /** Defaults to 20. Capped at 100. */
  pageSize?: number;
  /** Filter to rows whose `state` column matches. */
  state?: string;
}

export interface ListCasesResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated list of case rows from a template's target_table. Filters by
 * display='Y' always (matches the master-soft-delete convention) and by
 * state when provided. Ordered newest-first by id.
 */
export async function listCases(input: ListCasesInput): Promise<ListCasesResult> {
  const loaded = await loadTemplate(input.templateKey);
  const targetTable = loaded.template.targetTable;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  // Conditions composed via sql.join so the WHERE clause stays parameterised
  // even when filters drop in/out. display='Y' is always present; state is
  // optional.
  const conds = [sql`display = 'Y'`];
  if (input.state) conds.push(sql`state = ${input.state}`);
  const where = sql.join(conds, sql` AND `);

  const countResult = await db.execute(sql`
    SELECT count(*)::int AS total FROM ${sql.identifier(targetTable)}
    WHERE ${where}
  `);
  const countRow = (countResult.rows ?? [])[0] as { total?: number } | undefined;
  const total = Number(countRow?.total ?? 0);

  const result = await db.execute(sql`
    SELECT * FROM ${sql.identifier(targetTable)}
    WHERE ${where}
    ORDER BY id DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return {
    items: (result.rows ?? []) as Array<Record<string, unknown>>,
    total,
    page,
    pageSize,
  };
}

export interface ReadCaseInput {
  templateKey: string;
  caseId: number;
}

export interface ReadCaseResult {
  caseId: number;
  templateKey: string;
  state: string;
  /** Raw row from the dynamic target_table — schema is per-entity. */
  entity: Record<string, unknown>;
  /** Transitions whose from_state matches the entity's current state. */
  availableTransitions: WorkflowTransitionMasterRow[];
}

/**
 * Read one case row from its target_table plus the transitions a caller
 * could invoke from its current state. Used by detail pages and any client
 * that needs to render advance buttons.
 */
export async function readCase(input: ReadCaseInput): Promise<ReadCaseResult> {
  const loaded = await loadTemplate(input.templateKey);
  const targetTable = loaded.template.targetTable;

  const result = await db.execute(sql`
    SELECT * FROM ${sql.identifier(targetTable)}
    WHERE id = ${input.caseId}
    LIMIT 1
  `);
  const entityRow = (result.rows ?? [])[0];
  if (!entityRow) {
    throw new NotFoundError(`Case ${input.caseId} not found in ${targetTable}`);
  }
  const entity = entityRow as Record<string, unknown>;
  const state = entity.state;
  if (typeof state !== 'string') {
    throw new BadRequestError(
      `Entity in ${targetTable} has no string 'state' column`,
    );
  }

  const availableTransitions = await listTransitions(
    loaded.workflow.workflowKey,
    state,
  );

  return {
    caseId: input.caseId,
    templateKey: input.templateKey,
    state,
    entity,
    availableTransitions,
  };
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

export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
  const loaded = await loadTemplate(input.templateKey);
  const form = await loadForm(loaded.form.formKey);
  const targetTable = loaded.template.targetTable;
  const initialState = loaded.workflow.initialState;

  // Field-level role grants: load the actor's per-field overrides, then
  // reject any submitted key that maps to a non-writable (view/hidden) field
  // for this role. Done BEFORE building the Zod schema so a hostile client
  // can't bypass grants by posting extra keys — Zod's default-strip would
  // silently drop them without any signal.
  const grants = await fetchFieldGrants(
    form.fields.map((f) => f.id),
    input.actorRoleId,
  );
  const writable = writableFieldIds(form.fields, grants);
  const writableKeys = new Set(writable.map((f) => f.fieldKey));
  const allFieldKeys = new Set(form.fields.map((f) => f.fieldKey));
  const readOnly = Object.keys(input.values).filter(
    (k) => allFieldKeys.has(k) && !writableKeys.has(k),
  );
  if (readOnly.length > 0) {
    throw new BadRequestError(
      `Field(s) are read-only for your role: ${readOnly.join(', ')}`,
      { readOnlyFields: readOnly },
    );
  }

  // Validate caller-provided values against the form's Zod schema. Bad input
  // throws ZodError, which withErrorHandler maps to a 422 — same path as any
  // hand-written Zod boundary. Build the schema from `writable` only so
  // omitted view-only fields aren't required at create time for this role.
  const validator = buildFormZodSchema(writable);
  const validated = validator.parse(input.values);

  // Caller-provided columns + system columns (state + audit). Same order in
  // both the column list and the values list so the INSERT is unambiguous.
  const cols: { col: string; val: unknown }[] = [
    ...Object.entries(validated).map(([col, val]) => ({ col, val })),
    { col: 'state', val: initialState },
    { col: 'created_by', val: input.actorUserId },
    { col: 'updated_by', val: input.actorUserId },
  ];

  const colNames = sql.join(
    cols.map((c) => sql.identifier(c.col)),
    sql`, `,
  );
  const colValues = sql.join(
    cols.map((c) => sql`${c.val}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    INSERT INTO ${sql.identifier(targetTable)} (${colNames})
    VALUES (${colValues})
    RETURNING id, state
  `);

  const rows = (result.rows ?? []) as unknown as ReadonlyArray<{ id: number; state: string }>;
  const inserted = rows[0];
  if (!inserted) {
    throw new Error(`createCase: INSERT into ${targetTable} returned no row`);
  }
  return {
    caseId: inserted.id,
    templateKey: input.templateKey,
    state: inserted.state,
  };
}

export async function advanceCase(input: AdvanceCaseInput): Promise<AdvanceCaseResult> {
  const loaded = await loadTemplate(input.templateKey);
  const targetTable = loaded.template.targetTable;

  return await db.transaction(async (tx) => {
    // Read the entity row dynamically — case-runtime doesn't have static
    // typing for arbitrary target_table columns, so the row lands as an
    // untyped Record. The id column is required to be `id`.
    const entityResult = await tx.execute(sql`
      SELECT * FROM ${sql.identifier(targetTable)}
      WHERE id = ${input.caseId}
      LIMIT 1
    `);
    const entityRow = (entityResult.rows ?? [])[0];
    if (!entityRow) {
      throw new NotFoundError(`Case ${input.caseId} not found in ${targetTable}`);
    }
    const entity = entityRow as Record<string, unknown>;
    const currentState = entity.state;
    if (typeof currentState !== 'string') {
      throw new BadRequestError(
        `Entity in ${targetTable} has no string 'state' column — cannot advance`,
      );
    }

    // Compute the execution plan (rule gate + actions) — engine layer.
    const plan = await executeTransition(
      loaded.workflow.workflowKey,
      input.transitionKey,
      {
        entity,
        actorUserId: input.actorUserId,
        actorRoleId: input.actorRoleId,
        payload: input.payload,
      },
    );

    // Refuse if the transition doesn't apply to the entity's current state.
    if (plan.fromState !== currentState) {
      throw new ConflictError(
        `Cannot apply transition '${input.transitionKey}': entity is in state ` +
          `'${currentState}' but the transition requires '${plan.fromState}'`,
      );
    }

    // Splice action patch + new state + audit columns into a single UPDATE.
    const updates: { col: string; val: unknown }[] = [
      ...Object.entries(plan.patch).map(([col, val]) => ({ col, val })),
      { col: 'state', val: plan.toState },
      { col: 'updated_by', val: input.actorUserId },
    ];

    const setClauses = sql.join(
      updates.map((u) => sql`${sql.identifier(u.col)} = ${u.val}`),
      sql`, `,
    );

    await tx.execute(sql`
      UPDATE ${sql.identifier(targetTable)}
      SET ${setClauses}, updated_at = now()
      WHERE id = ${input.caseId}
    `);

    // Persist notify side effects in the same transaction so either both
    // the UPDATE and the outbox rows land or neither does — classic
    // outbox pattern. The dispatcher worker (future slice) reads
    // status='pending' rows and actually sends.
    await enqueueNotifications(tx, plan.sideEffects, {
      templateKey: input.templateKey,
      caseId: input.caseId,
    });

    return {
      caseId: input.caseId,
      templateKey: input.templateKey,
      workflowKey: plan.workflowKey,
      transitionKey: plan.transitionKey,
      previousState: plan.fromState,
      newState: plan.toState,
      sideEffects: plan.sideEffects,
    };
  });
}
