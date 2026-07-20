import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequestError, ForbiddenError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';

// Bulk update helpers — adapted from main-branch master_bulk_filter_t
// design call (C-track from the (B)-bucket triage), but tighter:
//
//   * Whitelist of (entity, table, editable columns, filter columns) is
//     CODE-DEFINED, not data-defined. Admins can't grant themselves
//     bulk-update on workflow-gated columns (e.g. license.state) without
//     a PR + code review.
//
//   * Predicate is a small JSON DSL — leaf `{ col, op, value? }` or
//     compound `{ all: [...] } / { any: [...] }`. Translated to safe SQL
//     via sql.identifier (column names) + parameter placeholders (values),
//     so no string interpolation reaches the planner.
//
//   * Two-phase API: /preview returns the match count without writing;
//     /apply runs the UPDATE inside a transaction + writes one audit row
//     describing the entire bulk op (filter + patch + matched_count).

export type BulkColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface BulkUpdateColumn {
  name: string;
  label: string;
  type: BulkColumnType;
}

export interface BulkUpdateTarget {
  /** Real table name in the DB (validated against sql.identifier). */
  table: string;
  label: string;
  /** Columns the operator may write in `patch`. */
  editableColumns: BulkUpdateColumn[];
  /** Columns the operator may reference in `filter`. */
  filterColumns: BulkUpdateColumn[];
}

// Whitelist. New entities + columns land here, not in a master table.
// `state` is deliberately excluded across the board — workflow transitions
// must go through case-runtime's executeTransition so rule gates and
// action_json fire. Bulk-editing state would bypass that.
export const BULK_UPDATE_TARGETS: Record<string, BulkUpdateTarget> = {
  license: {
    table: 'license_t',
    label: 'Licenses',
    editableColumns: [
      { name: 'notes', label: 'Notes', type: 'text' },
      { name: 'expiry_date', label: 'Expiry Date', type: 'date' },
    ],
    filterColumns: [
      { name: 'state', label: 'State', type: 'text' },
      { name: 'license_type_id', label: 'License Type', type: 'number' },
      { name: 'client_id', label: 'Client', type: 'number' },
    ],
  },
  invoice: {
    table: 'invoice_t',
    label: 'Invoices',
    editableColumns: [
      { name: 'notes', label: 'Notes', type: 'text' },
      { name: 'due_date', label: 'Due Date', type: 'date' },
    ],
    filterColumns: [
      { name: 'state', label: 'State', type: 'text' },
      { name: 'client_id', label: 'Client', type: 'number' },
      { name: 'license_id', label: 'License', type: 'number' },
    ],
  },
  credit_note: {
    table: 'credit_note_t',
    label: 'Credit Notes',
    editableColumns: [
      { name: 'notes', label: 'Notes', type: 'text' },
      { name: 'issued_date', label: 'Issued Date', type: 'date' },
    ],
    filterColumns: [
      { name: 'state', label: 'State', type: 'text' },
      { name: 'client_id', label: 'Client', type: 'number' },
      { name: 'invoice_id', label: 'Invoice', type: 'number' },
    ],
  },
  tracking: {
    table: 'tracking_t',
    label: 'Tracking Runs',
    editableColumns: [
      { name: 'notes', label: 'Notes', type: 'text' },
    ],
    filterColumns: [
      { name: 'state', label: 'State', type: 'text' },
      { name: 'license_id', label: 'License', type: 'number' },
      { name: 'template_id', label: 'Template', type: 'number' },
    ],
  },
  payment_request: {
    table: 'payment_request_t',
    label: 'Payment Requests',
    editableColumns: [
      { name: 'notes', label: 'Notes', type: 'text' },
      { name: 'due_date', label: 'Due Date', type: 'date' },
    ],
    filterColumns: [
      { name: 'state', label: 'State', type: 'text' },
      { name: 'client_id', label: 'Client', type: 'number' },
      { name: 'invoice_id', label: 'Invoice', type: 'number' },
    ],
  },
  quotation: {
    table: 'quotations_t',
    label: 'Quotations',
    editableColumns: [
      { name: 'quotation_date', label: 'Quotation Date', type: 'date' },
      { name: 'arsp', label: 'ARSP', type: 'text' },
    ],
    filterColumns: [
      { name: 'client_id', label: 'Client', type: 'number' },
      { name: 'kind_id', label: 'Kind', type: 'number' },
    ],
  },
  // Imports carry many operator-fillable customs fields; per-row
  // bulk edit is how staff clear a batch of "missing declaration
  // reference" imports without opening each detail page. Editable
  // set intentionally excludes financial columns (weight/fob) —
  // those flow from source documents and shouldn't be edited in
  // bulk without going through the entity's audited create path.
  import: {
    table: 'imports_t',
    label: 'Imports',
    editableColumns: [
      { name: 'declaration_reference', label: 'Declaration reference', type: 'text' },
      { name: 'customs_manifest_number', label: 'Customs manifest #', type: 'text' },
      { name: 'dgda_in_date', label: 'DGDA in date', type: 'date' },
      { name: 'dgda_out_date', label: 'DGDA out date', type: 'date' },
      { name: 'quittance_reference', label: 'Quittance reference', type: 'text' },
      { name: 'archive_reference', label: 'Archive reference', type: 'text' },
      { name: 'remarks', label: 'Remarks', type: 'text' },
    ],
    filterColumns: [
      { name: 'client_id', label: 'Client', type: 'number' },
      { name: 'license_id', label: 'License', type: 'number' },
      { name: 'regime_id', label: 'Regime', type: 'number' },
      { name: 'clearing_status_id', label: 'Clearing status', type: 'number' },
      { name: 'declaration_reference', label: 'Declaration reference', type: 'text' },
      { name: 'customs_manifest_number', label: 'Customs manifest #', type: 'text' },
      { name: 'dgda_in_date', label: 'DGDA in date', type: 'date' },
      { name: 'display', label: 'Display', type: 'text' },
    ],
  },
};

// --- Predicate DSL ----------------------------------------------------

const leafOpSchema = z.enum([
  'eq',
  'neq',
  'isNull',
  'isNotNull',
  'in',
]);

// Recursive Zod for the predicate tree. Zod's z.lazy + a manual type so
// the leaf/compound union narrows cleanly downstream.
type PredicateLeaf = {
  col: string;
  op: z.infer<typeof leafOpSchema>;
  value?: unknown;
};
type PredicateAll = { all: Predicate[] };
type PredicateAny = { any: Predicate[] };
export type Predicate = PredicateLeaf | PredicateAll | PredicateAny;

const predicateLeafSchema: z.ZodType<PredicateLeaf> = z.object({
  col: z.string().min(1),
  op: leafOpSchema,
  value: z.unknown().optional(),
});

const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    predicateLeafSchema,
    z.object({ all: z.array(predicateSchema).min(1) }),
    z.object({ any: z.array(predicateSchema).min(1) }),
  ]),
);

export { predicateSchema };

function isLeaf(p: Predicate): p is PredicateLeaf {
  return 'col' in p && 'op' in p;
}
function isAll(p: Predicate): p is PredicateAll {
  return 'all' in p;
}

/**
 * Compile a predicate against a column whitelist into a Drizzle `SQL`
 * fragment. Throws BadRequestError on unknown columns. Used by both
 * /preview (COUNT) and /apply (UPDATE).
 *
 * Pure-ish — touches the sql tag from drizzle-orm but doesn't execute.
 */
export function buildWhereSql(
  predicate: Predicate,
  filterColumns: ReadonlyArray<BulkUpdateColumn>,
): SQL {
  const allowed = new Set(filterColumns.map((c) => c.name));

  function compile(p: Predicate): SQL {
    if (isLeaf(p)) {
      if (!allowed.has(p.col)) {
        throw new BadRequestError(
          `Column '${p.col}' is not a permitted filter column`,
        );
      }
      const col = sql.identifier(p.col);
      switch (p.op) {
        case 'eq':
          return sql`${col} = ${p.value}`;
        case 'neq':
          return sql`${col} <> ${p.value}`;
        case 'isNull':
          return sql`${col} IS NULL`;
        case 'isNotNull':
          return sql`${col} IS NOT NULL`;
        case 'in': {
          if (!Array.isArray(p.value) || p.value.length === 0) {
            throw new BadRequestError(
              `Op 'in' on column '${p.col}' requires a non-empty array value`,
            );
          }
          // sql.join parameterizes each element individually.
          const list = sql.join(
            p.value.map((v) => sql`${v}`),
            sql`, `,
          );
          return sql`${col} IN (${list})`;
        }
      }
    }
    if (isAll(p)) {
      if (p.all.length === 0) {
        throw new BadRequestError('Empty AND group');
      }
      return sql`(${sql.join(p.all.map(compile), sql` AND `)})`;
    }
    if (p.any.length === 0) {
      throw new BadRequestError('Empty OR group');
    }
    return sql`(${sql.join(p.any.map(compile), sql` OR `)})`;
  }

  return compile(predicate);
}

/**
 * Validate a patch object against the editable-column whitelist. Throws
 * on unknown keys or empty payloads. Returns the validated map for the
 * UPDATE assignment list.
 */
export function validatePatch(
  patch: Record<string, unknown>,
  editableColumns: ReadonlyArray<BulkUpdateColumn>,
): Map<string, unknown> {
  const allowed = new Set(editableColumns.map((c) => c.name));
  const result = new Map<string, unknown>();
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) {
      throw new BadRequestError(
        `Column '${k}' is not a permitted editable column`,
      );
    }
    result.set(k, v);
  }
  if (result.size === 0) {
    throw new BadRequestError('Patch must include at least one column');
  }
  return result;
}

// --- Execution -------------------------------------------------------

export interface BulkUpdateArgs {
  entity: string;
  predicate: Predicate;
  patch: Record<string, unknown>;
  actorUserId: number;
}

export interface BulkUpdatePreviewResult {
  entity: string;
  table: string;
  matched_count: number;
}

export interface BulkUpdateResult {
  entity: string;
  table: string;
  matched_count: number;
  updated_count: number;
}

function getTarget(entity: string): BulkUpdateTarget {
  const target = BULK_UPDATE_TARGETS[entity];
  if (!target) {
    throw new ForbiddenError(`Bulk-update target '${entity}' is not permitted`);
  }
  return target;
}

/**
 * Count rows that match the predicate. Used by the UI's "preview" step
 * before the operator hits Apply — they see exactly how many rows will
 * change.
 */
export async function previewBulkUpdate(args: {
  entity: string;
  predicate: Predicate;
}): Promise<BulkUpdatePreviewResult> {
  const target = getTarget(args.entity);
  const where = buildWhereSql(args.predicate, target.filterColumns);
  const result = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM ${sql.identifier(target.table)}
    WHERE ${where}
  `);
  const row = (result.rows ?? [])[0] as { n?: number } | undefined;
  return {
    entity: args.entity,
    table: target.table,
    matched_count: Number(row?.n ?? 0),
  };
}

/**
 * Execute the bulk update. Wraps the UPDATE + audit row in one
 * transaction so partial state is impossible. updated_at is bumped to
 * NOW(); updated_by is the actor. The audit row records the filter +
 * patch + matched_count so the operation is fully reconstructable from
 * audit_log_t alone.
 */
export async function applyBulkUpdate(
  args: BulkUpdateArgs,
): Promise<BulkUpdateResult> {
  const target = getTarget(args.entity);
  const where = buildWhereSql(args.predicate, target.filterColumns);
  const patch = validatePatch(args.patch, target.editableColumns);

  return await db.transaction(async (tx) => {
    // Count matches first so the audit row is accurate even if RETURNING
    // is unavailable (e.g. row count from UPDATE alone). Done in the
    // same tx so concurrent inserts after the count don't get updated
    // by the next statement.
    const countResult = await tx.execute(sql`
      SELECT count(*)::int AS n
      FROM ${sql.identifier(target.table)}
      WHERE ${where}
    `);
    const matched = Number(
      ((countResult.rows ?? [])[0] as { n?: number } | undefined)?.n ?? 0,
    );

    // Build the SET clause: each entry becomes `col = $n`.
    const setClauses = Array.from(patch.entries()).map(
      ([col, value]) => sql`${sql.identifier(col)} = ${value}`,
    );
    setClauses.push(sql`${sql.identifier('updated_by')} = ${args.actorUserId}`);
    setClauses.push(sql`${sql.identifier('updated_at')} = now()`);
    const setSql = sql.join(setClauses, sql`, `);

    const updateResult = await tx.execute(sql`
      UPDATE ${sql.identifier(target.table)}
      SET ${setSql}
      WHERE ${where}
    `);
    const updated = (updateResult as { rowCount?: number }).rowCount ?? matched;

    await recordAudit(tx, {
      actorId: args.actorUserId,
      action: 'update',
      entityType: args.entity,
      entityId: 'bulk',
      metadata: {
        op: 'bulk-update',
        filter: args.predicate,
        patch: args.patch,
        matched_count: matched,
        updated_count: updated,
      },
    });

    return {
      entity: args.entity,
      table: target.table,
      matched_count: matched,
      updated_count: updated,
    };
  });
}

// --- Per-row bulk edit ----------------------------------------------
//
// Distinct from applyBulkUpdate: instead of "same patch across many
// rows matched by a filter", this is "different patch per row, keyed
// by row id". The filter still narrows the row set the operator
// sees; each row's edits go to that row only.
//
// The public helper is the same shape — validated whitelist + one
// transaction + one audit row per bulk-edit operation. Per-row
// patches are still checked against editableColumns; if any row's
// patch tries an unknown column, the whole batch rolls back.

export interface PerRowEdit {
  id: number;
  patch: Record<string, unknown>;
}

export interface PerRowEditArgs {
  entity: string;
  edits: PerRowEdit[];
  actorUserId: number;
}

export interface PerRowEditResult {
  entity: string;
  table: string;
  requested_count: number;
  updated_count: number;
}

/**
 * Fetch rows matching a predicate for the per-row bulk-edit UI.
 * Returns id + every editable column value (so the UI can pre-fill
 * inputs) plus a small set of context columns for display.
 *
 * Paginated: 25 rows per page by default. The whole match set can
 * be loaded a page at a time; the UI keeps pending edits across
 * page boundaries so the operator can jump around.
 */
export async function loadBulkEditRows(args: {
  entity: string;
  predicate: Predicate;
  page: number;
  pageSize: number;
  displayColumns?: string[];
}): Promise<{
  entity: string;
  table: string;
  total: number;
  page: number;
  pageSize: number;
  editable_columns: BulkUpdateColumn[];
  display_columns: string[];
  rows: Array<Record<string, unknown>>;
}> {
  const target = getTarget(args.entity);
  const where = buildWhereSql(args.predicate, target.filterColumns);
  const displayCols = args.displayColumns ?? [];
  const editableCols = target.editableColumns.map((c) => c.name);

  // SELECT list: id + display cols + editable cols (deduped).
  const uniqCols = Array.from(
    new Set<string>(['id', ...displayCols, ...editableCols]),
  );
  const selectSql = sql.join(
    uniqCols.map((c) => sql.identifier(c)),
    sql`, `,
  );

  const offset = Math.max(0, (args.page - 1) * args.pageSize);

  const countResult = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM ${sql.identifier(target.table)}
    WHERE ${where}
  `);
  const total = Number(
    ((countResult.rows ?? [])[0] as { n?: number } | undefined)?.n ?? 0,
  );

  const rowsResult = await db.execute(sql`
    SELECT ${selectSql}
    FROM ${sql.identifier(target.table)}
    WHERE ${where}
    ORDER BY id DESC
    LIMIT ${args.pageSize} OFFSET ${offset}
  `);

  return {
    entity: args.entity,
    table: target.table,
    total,
    page: args.page,
    pageSize: args.pageSize,
    editable_columns: target.editableColumns,
    display_columns: displayCols,
    rows: (rowsResult.rows ?? []) as Array<Record<string, unknown>>,
  };
}

/**
 * Apply a list of per-row edits in a single transaction. Every
 * patch is validated against the entity's editableColumns
 * whitelist before any SQL runs; unknown columns fail the whole
 * batch. Rows whose patch is empty are silently skipped so a UI
 * can submit its full state without pre-filtering.
 */
export async function applyPerRowEdits(
  args: PerRowEditArgs,
): Promise<PerRowEditResult> {
  const target = getTarget(args.entity);

  if (args.edits.length === 0) {
    throw new BadRequestError('edits must be a non-empty array');
  }

  // Validate every patch first — no writes if any patch fails.
  const validated: Array<{ id: number; patch: Map<string, unknown> }> = [];
  for (const e of args.edits) {
    if (!Number.isInteger(e.id) || e.id <= 0) {
      throw new BadRequestError(`Invalid id: ${e.id}`);
    }
    if (!e.patch || Object.keys(e.patch).length === 0) continue;
    validated.push({
      id: e.id,
      patch: validatePatch(e.patch, target.editableColumns),
    });
  }

  if (validated.length === 0) {
    return {
      entity: args.entity,
      table: target.table,
      requested_count: args.edits.length,
      updated_count: 0,
    };
  }

  return await db.transaction(async (tx) => {
    let updated = 0;

    for (const { id, patch } of validated) {
      const setClauses = Array.from(patch.entries()).map(
        ([col, value]) => sql`${sql.identifier(col)} = ${value}`,
      );
      setClauses.push(sql`${sql.identifier('updated_by')} = ${args.actorUserId}`);
      setClauses.push(sql`${sql.identifier('updated_at')} = now()`);
      const setSql = sql.join(setClauses, sql`, `);

      const result = await tx.execute(sql`
        UPDATE ${sql.identifier(target.table)}
        SET ${setSql}
        WHERE id = ${id}
      `);
      updated += (result as { rowCount?: number }).rowCount ?? 0;
    }

    await recordAudit(tx, {
      actorId: args.actorUserId,
      action: 'update',
      entityType: args.entity,
      entityId: 'bulk',
      metadata: {
        op: 'bulk-edit-per-row',
        edits: args.edits,
        requested_count: args.edits.length,
        updated_count: updated,
      },
    });

    return {
      entity: args.entity,
      table: target.table,
      requested_count: args.edits.length,
      updated_count: updated,
    };
  });
}
