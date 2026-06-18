import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportDefinitionMaster } from '@/db/schema';
import { loadForm } from '@/engine/forms';
import { buildFormZodSchema } from '@/engine/forms/validation';
import {
  BadRequestError,
  NotFoundError,
} from '@/lib/errors';
import { reportColumnsSchema, type ReportColumn } from '@/reports/types';
import { getReportHandler } from '@/reports/registry';

// Reports runtime per CLAUDE.md §2 step 7.
//
// Resolves a report_key against report_definition_master_t for metadata
// (name, columns, parameter form), validates the caller's params with the
// linked form_definition's Zod schema, and dispatches to the code-side
// handler. Handler queries live in src/reports/ — kept in versioned code
// rather than in a master table so admins can't accidentally craft
// SQL-injection vectors via a form.

export interface ReportSummary {
  id: number;
  reportKey: string;
  name: string;
  description: string | null;
  category: string | null;
  hasParameters: boolean;
  displayOrder: number;
}

export interface ReportDefinitionLoaded {
  id: number;
  reportKey: string;
  name: string;
  description: string | null;
  category: string | null;
  columns: ReportColumn[];
  /** Form key the runner page uses to render the parameter inputs. */
  parameterFormKey: string | null;
}

export interface ReportRunResult {
  reportKey: string;
  name: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  ranAt: string;
}

/** List every visible report row for the index page. */
export async function listReports(): Promise<ReportSummary[]> {
  const rows = await db
    .select({
      id: reportDefinitionMaster.id,
      reportKey: reportDefinitionMaster.reportKey,
      name: reportDefinitionMaster.name,
      description: reportDefinitionMaster.description,
      category: reportDefinitionMaster.category,
      formId: reportDefinitionMaster.formId,
      displayOrder: reportDefinitionMaster.displayOrder,
    })
    .from(reportDefinitionMaster)
    .where(eq(reportDefinitionMaster.display, 'Y'))
    .orderBy(asc(reportDefinitionMaster.displayOrder), asc(reportDefinitionMaster.name));

  return rows.map((r) => ({
    id: r.id,
    reportKey: r.reportKey,
    name: r.name,
    description: r.description,
    category: r.category,
    hasParameters: r.formId != null,
    displayOrder: r.displayOrder,
  }));
}

async function loadDefinition(
  reportKey: string,
): Promise<{
  row: typeof reportDefinitionMaster.$inferSelect;
  columns: ReportColumn[];
}> {
  const [row] = await db
    .select()
    .from(reportDefinitionMaster)
    .where(eq(reportDefinitionMaster.reportKey, reportKey))
    .limit(1);
  if (!row || row.display !== 'Y') {
    throw new NotFoundError(`Report not found: ${reportKey}`);
  }
  const columns = reportColumnsSchema.parse(row.columnsJson);
  return { row, columns };
}

/**
 * Resolve a report by key + return its metadata. Used by the runner page
 * to render the title + parameter form before the user submits. Does not
 * execute the query — that's runReport.
 */
export async function loadReportDefinition(
  reportKey: string,
): Promise<ReportDefinitionLoaded> {
  const { row, columns } = await loadDefinition(reportKey);

  let parameterFormKey: string | null = null;
  if (row.formId) {
    // Round-trip through form_definition_master_t for the formKey so the
    // client-side DynamicForm consumer can call loadForm by key — same
    // shape every other dynamic form in the app uses.
    parameterFormKey = await resolveFormKey(row.formId);
  }

  return {
    id: row.id,
    reportKey: row.reportKey,
    name: row.name,
    description: row.description,
    category: row.category,
    columns,
    parameterFormKey,
  };
}

// Internal helper — id → key for the linked form_definition_master_t.
async function resolveFormKey(formId: number): Promise<string> {
  const { formDefinitionMaster } = await import('@/db/schema');
  const [row] = await db
    .select({ formKey: formDefinitionMaster.formKey })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.id, formId))
    .limit(1);
  if (!row) {
    throw new NotFoundError(`Form definition ${formId} not found`);
  }
  return row.formKey;
}

/**
 * Run a report against the supplied parameters. Parameters are validated
 * by the linked form_definition's Zod schema before the handler sees them
 * — handlers can trust the shape.
 */
export async function runReport(args: {
  reportKey: string;
  params?: Record<string, unknown>;
}): Promise<ReportRunResult> {
  const { row, columns } = await loadDefinition(args.reportKey);

  // Validate parameters against the linked form if one exists.
  let validatedParams: Record<string, unknown> | undefined;
  if (row.formId) {
    const form = await loadForm(await resolveFormKey(row.formId));
    const schema = buildFormZodSchema(form.fields);
    const parseResult = schema.safeParse(args.params ?? {});
    if (!parseResult.success) {
      throw new BadRequestError('Invalid report parameters', {
        issues: parseResult.error.issues,
      });
    }
    validatedParams = parseResult.data;
  } else if (args.params && Object.keys(args.params).length > 0) {
    throw new BadRequestError(
      `Report '${args.reportKey}' takes no parameters but received some`,
    );
  }

  const entry = getReportHandler(args.reportKey);
  if (!entry) {
    throw new NotFoundError(
      `Report '${args.reportKey}' exists in report_definition_master_t but no ` +
        `handler is wired up — add an entry to src/reports/registry.ts`,
    );
  }

  const rows = await entry.handler(validatedParams);
  return {
    reportKey: row.reportKey,
    name: row.name,
    columns,
    rows,
    ranAt: new Date().toISOString(),
  };
}
