// A module's Excel export, built from the page definition rather than a
// hand-written column list.
//
// The hand-written lists had all drifted below the forms they describe: Import
// Tracking has 90 configured fields and its export emitted 20 columns, so two
// thirds of every consignment was missing from the spreadsheet. A list that has
// to be maintained by hand alongside a 90-field form will always lose that race.
//
// Reading the same `master_page_accordion_field_t` rows the form renders makes
// the export complete by construction: add a field to a page and it appears in
// the export with no code change (§4.1, §4.10).
import { and, asc, desc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { masterPage, masterPageAccordion, masterPageAccordionField, usersT } from '@/db/schema';
import { getPageTarget } from '@/lib/pages/targets';
import { getSoftDeleteResource } from '@/db/queries/softDelete';
import { formatDate } from '@/lib/formatDate';
import type { XlsxColumn, XlsxSheet } from '@/lib/xlsx';

interface FieldDef {
  name: string;
  label: string;
  fieldType: string;
  optionsSource: string | null;
  optionsLabelField: string | null;
  optionsStatic: unknown;
}

/**
 * Sources that resolve ids to labels but are not soft-deletable, so they are
 * absent from the recycle-bin registry. Kept to the genuine exceptions rather
 * than growing into a second copy of that registry — a user account is not
 * recycle-bin material, but "Verified By: 3" is a useless spreadsheet cell.
 */
const EXTRA_LABEL_SOURCES: Record<string, { id: PgColumn; label: PgColumn }> = {
  users: { id: usersT.id, label: usersT.fullName },
};

/** `kinds?group=import` and `regimes?type=I` name the same table as their base. */
function baseSource(source: string): string {
  return source.split('?')[0] ?? source;
}

function labelColumns(source: string): { id: PgColumn; label: PgColumn } | null {
  const key = baseSource(source);
  const extra = EXTRA_LABEL_SOURCES[key];
  if (extra) return extra;
  const res = getSoftDeleteResource(key);
  return res ? { id: res.idColumn, label: res.labelColumn } : null;
}

/** Static options carry their own label — resolve without touching the database. */
function staticLabels(optionsStatic: unknown): Map<string, string> | null {
  if (!Array.isArray(optionsStatic)) return null;
  const map = new Map<string, string>();
  for (const raw of optionsStatic) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (o.value === undefined || o.label === undefined) continue;
    map.set(String(o.value), String(o.label));
  }
  return map.size > 0 ? map : null;
}

const DATE_TYPES = new Set(['date', 'datetime']);

/**
 * A repeating-row field (the remarks log, the MCA grid) flattened into one cell.
 *
 * A spreadsheet cell has no rows of its own, so each entry becomes a line and the
 * whole thing stays readable when the column is widened — far better than the
 * raw JSON a naive String() would emit.
 */
function flattenRows(rows: unknown[]): string {
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return String(row ?? '');
      const entries = Object.entries(row as Record<string, unknown>).filter(
        ([, v]) => v !== null && v !== undefined && v !== '',
      );
      return entries
        .map(([k, v]) => (/(^|_)date$/u.test(k) ? formatDate(v, '') : String(v)))
        .join(' — ');
    })
    .filter(Boolean)
    .join('\n');
}

function cell(value: unknown, field: FieldDef, labels: Map<string, string> | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return flattenRows(value);
  if (labels) {
    const hit = labels.get(String(value));
    if (hit !== undefined) return hit;
  }
  if (DATE_TYPES.has(field.fieldType)) return formatDate(value, '');
  if (value instanceof Date) return formatDate(value, '');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Column width from the field type — a date needs less room than an address. */
function widthFor(fieldType: string): number {
  if (DATE_TYPES.has(fieldType)) return 14;
  if (fieldType === 'number') return 14;
  if (fieldType === 'textarea') return 40;
  if (fieldType === 'remark-log' || fieldType === 'mca-grid') return 50;
  return 22;
}

export interface PageExportOptions {
  /** Extra WHERE on the target table, e.g. the list screen's own filters. */
  where?: SQL | undefined;
  /** Cap so one click cannot pull an unbounded table into memory. */
  limit?: number;
  /** Sheet name; defaults to the page title. */
  sheetName?: string;
}

/**
 * Every field on a page, for every matching row, as one spreadsheet sheet.
 *
 * Fields whose `name` is not a real column on the target table (layout-only or
 * renamed entries) are skipped rather than throwing — a stale config row should
 * not take the whole export down with it.
 */
export async function buildPageExportSheet(
  slug: string,
  opts: PageExportOptions = {},
): Promise<XlsxSheet> {
  const target = getPageTarget(slug);
  if (!target) throw new Error(`Unknown page: ${slug}`);

  const [pageRow] = await db
    .select({ id: masterPage.id, title: masterPage.title })
    .from(masterPage)
    .where(eq(masterPage.slug, slug))
    .limit(1);
  if (!pageRow) throw new Error(`Unknown page: ${slug}`);

  const fieldRows = await db
    .select({
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      fieldType: masterPageAccordionField.fieldType,
      optionsSource: masterPageAccordionField.optionsSource,
      optionsLabelField: masterPageAccordionField.optionsLabelField,
      optionsStatic: masterPageAccordionField.optionsStatic,
    })
    .from(masterPageAccordionField)
    .innerJoin(
      masterPageAccordion,
      eq(masterPageAccordion.id, masterPageAccordionField.accordionId),
    )
    .where(
      and(
        eq(masterPageAccordion.pageId, pageRow.id),
        eq(masterPageAccordionField.display, 'Y'),
        eq(masterPageAccordion.display, 'Y'),
      ),
    )
    .orderBy(
      asc(masterPageAccordion.displayOrder),
      asc(masterPageAccordionField.displayOrder),
      asc(masterPageAccordionField.id),
    );

  // Match config names to real columns; a field naming a column that no longer
  // exists is dropped here rather than producing invalid SQL.
  const columnsByName = new Map(
    Object.values(getTableColumns(target.table)).map((c) => [c.name, c as PgColumn]),
  );

  const fields: FieldDef[] = [];
  const selection: Record<string, PgColumn> = {};
  const seen = new Set<string>();
  for (const f of fieldRows) {
    const col = columnsByName.get(f.name);
    if (!col || seen.has(f.name)) continue;
    seen.add(f.name);
    fields.push(f as FieldDef);
    selection[f.name] = col;
  }

  // The id is not a form field but every export wants it as the row's handle.
  const idColumn = columnsByName.get('id');
  if (idColumn) selection.id = idColumn;

  const displayColumn = columnsByName.get('display');
  const where = displayColumn
    ? and(eq(displayColumn, 'Y'), ...(opts.where ? [opts.where] : []))
    : opts.where;

  const rows = idColumn
    ? await db
        .select(selection)
        .from(target.table)
        .where(where)
        .orderBy(desc(idColumn))
        .limit(opts.limit ?? 10000)
    : await db.select(selection).from(target.table).where(where).limit(opts.limit ?? 10000);

  // One lookup per distinct source, not per row — a 90-column export over a few
  // thousand rows would otherwise issue hundreds of thousands of queries.
  const labelMaps = new Map<string, Map<string, string>>();
  for (const f of fields) {
    const stat = staticLabels(f.optionsStatic);
    if (stat) {
      labelMaps.set(f.name, stat);
      continue;
    }
    if (!f.optionsSource) continue;
    const cols = labelColumns(f.optionsSource);
    if (!cols) continue;

    const ids = [
      ...new Set(
        rows
          .map((r) => (r as Record<string, unknown>)[f.name])
          .filter((v): v is number | string => v !== null && v !== undefined && v !== '')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (ids.length === 0) continue;

    const lookup = await db
      .select({ id: cols.id, label: cols.label })
      .from(cols.id.table)
      .where(inArray(cols.id, ids));
    labelMaps.set(
      f.name,
      new Map(lookup.map((l) => [String(l.id), String(l.label ?? '')])),
    );
  }

  const columns: XlsxColumn[] = [
    { key: 'id', header: 'ID', width: 8 },
    ...fields.map((f) => ({ key: f.name, header: f.label, width: widthFor(f.fieldType) })),
  ];

  const sheetRows = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { id: r.id };
    for (const f of fields) out[f.name] = cell(r[f.name], f, labelMaps.get(f.name));
    return out;
  });

  return {
    name: opts.sheetName ?? pageRow.title,
    columns,
    rows: sheetRows,
  };
}
