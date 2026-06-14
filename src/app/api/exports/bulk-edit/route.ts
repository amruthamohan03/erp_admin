// §4.9 + §4.10 — filter-driven per-row bulk editor for Export Tracking (the legacy
// "Bulk Update" tool, config-driven). GET returns either the catalog of filters
// (no `filter` param) or the rows matching a filter + the editable-field metadata;
// POST applies a batch of PER-ROW edits, each audited inside one transaction.
//
// Distinct from POST /api/exports/bulk (set one value across many rows). Here every
// row carries its own values, and the filter→predicate→fields mapping is data
// (master_bulk_filter_t), translated to safe whitelisted SQL.
import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  masterBulkFilter,
  masterPage,
  masterPageAccordion,
  masterPageAccordionField,
  masterPageAccordionRole,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { getPageTarget } from '@/lib/pages/targets';
import { buildBulkWhere, safeEditableColumns, type BulkPredicate } from '@/lib/pages/bulkFilters';
import { recordAudit } from '@/lib/audit/recordAudit';

const PAGE_SLUG = 'export';
const MAX_UPDATES = 500;

// Bulk access piggybacks on an EDIT grant on any export accordion (§4.7/§4.12).
async function hasExportEditAccess(roleId: number): Promise<boolean> {
  const rows = await db
    .select({ id: masterPageAccordion.id })
    .from(masterPage)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
    .innerJoin(masterPageAccordionRole, eq(masterPageAccordionRole.accordionId, masterPageAccordion.id))
    .where(and(
      eq(masterPage.slug, PAGE_SLUG),
      eq(masterPageAccordionRole.roleId, roleId),
      eq(masterPageAccordionRole.permission, 'edit'),
    ))
    .limit(1);
  return rows.length > 0;
}

async function loadFilter(filterKey: string) {
  const [row] = await db
    .select({
      filter_key: masterBulkFilter.filterKey,
      label: masterBulkFilter.label,
      predicate: masterBulkFilter.predicate,
      editable_fields: masterBulkFilter.editableFields,
    })
    .from(masterBulkFilter)
    .where(and(
      eq(masterBulkFilter.pageSlug, PAGE_SLUG),
      eq(masterBulkFilter.filterKey, filterKey),
      eq(masterBulkFilter.display, 'Y'),
    ))
    .limit(1);
  return row ?? null;
}

// Field labels/types come from the export page's field config, so the editor
// renders the same label + input type as the main form.
async function fieldMeta(names: string[]): Promise<Array<{ name: string; label: string; field_type: string }>> {
  if (names.length === 0) return [];
  const rows = await db
    .select({
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      field_type: masterPageAccordionField.fieldType,
    })
    .from(masterPageAccordionField)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.id, masterPageAccordionField.accordionId))
    .innerJoin(masterPage, eq(masterPage.id, masterPageAccordion.pageId))
    .where(and(eq(masterPage.slug, PAGE_SLUG), inArray(masterPageAccordionField.name, names)));
  const byName = new Map(rows.map((r) => [r.name, r]));
  return names.map((n) => byName.get(n) ?? { name: n, label: n, field_type: 'text' });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  if (!(await hasExportEditAccess(session.role_id))) return fail('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const filterKey = searchParams.get('filter');

  // No filter → the catalog for the dropdown.
  if (!filterKey) {
    const filters = await db
      .select({ filter_key: masterBulkFilter.filterKey, label: masterBulkFilter.label })
      .from(masterBulkFilter)
      .where(and(eq(masterBulkFilter.pageSlug, PAGE_SLUG), eq(masterBulkFilter.display, 'Y')))
      .orderBy(asc(masterBulkFilter.displayOrder));
    return ok({ filters });
  }

  const filter = await loadFilter(filterKey);
  if (!filter) return fail('Unknown filter', 404);

  const editable = safeEditableColumns(PAGE_SLUG, filter.editable_fields);
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? 25) || 25));
  const q = (searchParams.get('q') ?? '').trim();

  let where = sql`i.display = 'Y' AND ${buildBulkWhere(PAGE_SLUG, filter.predicate as BulkPredicate)}`;
  if (q) {
    const like = `%${q}%`;
    where = sql`${where} AND (i.mca_ref ILIKE ${like} OR c.short_name ILIKE ${like}
      OR i.horse ILIKE ${like} OR i.trailer_1 ILIKE ${like} OR i.trailer_2 ILIKE ${like}
      OR i.wagon_ref ILIKE ${like} OR i.container ILIKE ${like} OR i.lot_number ILIKE ${like})`;
  }

  const editableProjection = editable.length
    ? sql`, ${sql.join(editable.map((c) => sql`${sql.identifier('i')}.${sql.identifier(c)}`), sql`, `)}`
    : sql``;

  const countRes = await db.execute(
    sql`SELECT COUNT(*)::int AS total FROM exports_t i LEFT JOIN clients_t c ON c.id = i.client_id WHERE ${where}`,
  );
  const total = (countRes as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0;

  const offset = (page - 1) * pageSize;
  const dataRes = await db.execute(
    sql`SELECT i.id, i.mca_ref, i.loading_date, c.short_name AS client_name${editableProjection}
        FROM exports_t i LEFT JOIN clients_t c ON c.id = i.client_id
        WHERE ${where}
        ORDER BY i.id ASC
        LIMIT ${pageSize} OFFSET ${offset}`,
  );
  const items = (dataRes as unknown as { rows: Record<string, unknown>[] }).rows;

  return ok({
    filter: { key: filter.filter_key, label: filter.label },
    fields: await fieldMeta(editable),
    items,
    total,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  if (!(await hasExportEditAccess(session.role_id))) return fail('Forbidden', 403);
  if (!getPageTarget(PAGE_SLUG)) return fail('Export page target not registered', 500);

  let body: { filter?: string; updates?: Array<Record<string, unknown>> };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const filterKey = body.filter;
  const updates = body.updates ?? [];
  if (!filterKey) return fail('filter is required', 422);
  if (!Array.isArray(updates) || updates.length === 0) return fail('No updates provided', 422);
  if (updates.length > MAX_UPDATES) return fail(`At most ${MAX_UPDATES} rows can be updated at once`, 422);

  const filter = await loadFilter(filterKey);
  if (!filter) return fail('Unknown filter', 404);
  const editable = new Set(safeEditableColumns(PAGE_SLUG, filter.editable_fields));
  if (editable.size === 0) return fail('Filter has no editable fields', 500);

  const updated = await db.transaction(async (tx) => {
    let count = 0;
    for (const u of updates) {
      const id = Number(u.id);
      if (!Number.isInteger(id) || id <= 0) continue;

      // Keep only this filter's editable columns; '' → NULL.
      const patch: Record<string, unknown> = {};
      for (const col of editable) {
        if (col in u) {
          const v = u[col];
          patch[col] = v === '' || v === undefined ? null : v;
        }
      }
      if (Object.keys(patch).length === 0) continue;

      const beforeRes = await tx.execute(
        sql`SELECT id, ${sql.join([...editable].map((c) => sql.identifier(c)), sql`, `)}
            FROM exports_t WHERE id = ${id} AND display = 'Y' LIMIT 1`,
      );
      const before = (beforeRes as unknown as { rows: Record<string, unknown>[] }).rows[0];
      if (!before) continue;

      const setSql = sql.join(
        [
          ...Object.keys(patch).map((c) => sql`${sql.identifier(c)} = ${patch[c]}`),
          sql`${sql.identifier('updated_by')} = ${session.uid}`,
          sql`${sql.identifier('updated_at')} = CURRENT_TIMESTAMP`,
        ],
        sql`, `,
      );
      await tx.execute(sql`UPDATE exports_t SET ${setSql} WHERE id = ${id}`);

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: `page:${PAGE_SLUG}`,
        entityId: String(id),
        before,
        after: patch,
        metadata: { bulk: true, filter: filterKey, fields: Object.keys(patch) },
      });
      count++;
    }
    return count;
  });

  return ok({ updated });
}
