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
import { db, type Database, type Transaction } from '@/lib/db';
import { masterPage, masterPageAccordion, masterPageAccordionField, usersT } from '@/db/schema';
import { getPageTarget } from '@/lib/pages/targets';
import { getSoftDeleteResource } from '@/db/queries/softDelete';
import { formatDate } from '@/lib/formatDate';
import { emptyFor, isBlank, NO_VALUE } from '@/lib/displayValue';
import type { XlsxColumn, XlsxRowTone, XlsxSheet } from '@/lib/xlsx';

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
 * A repeating-row field (the remarks log, the file grid) flattened into one cell.
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
  // §4.41 — a blank text field reads "N/A"; a blank date or number stays an
  // empty cell, so a spreadsheet can still sum and sort the column.
  const empty = emptyFor(field.fieldType) === NO_VALUE ? NO_VALUE : '';
  if (isBlank(value)) return empty;
  if (Array.isArray(value)) return value.length ? flattenRows(value) : empty;
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
  /**
   * Shade each row by what the record IS (§4.20's reasoning, in a spreadsheet).
   *
   * Handed the RAW database row, not the formatted one: by the time a cell has
   * been through `cell()` a date is a `DD-MM-YYYY` string and a foreign key is a
   * label, so a rule like "expiring within 30 days" would have to parse its way
   * back to the values it started from.
   */
  rowTone?: (raw: Record<string, unknown>) => XlsxRowTone | null;
  /**
   * Columns to select and export ON TOP of the page's own fields.
   *
   * A page field is something an operator TYPES, so a column the system derives
   * or maintains is absent from the form and therefore absent from the export —
   * `license_t.status` is the case that exposed this: the licences sheet had no
   * Status column at all, and a `rowTone` rule that depended on it silently saw
   * `undefined` and painted nothing.
   *
   * `value` computes the cell from the raw row, so a column can be derived
   * (EXPIRED is a date passing, not a stored value) rather than only copied.
   */
  extraColumns?: Array<{
    /** Real column on the target table — selected so `value` can read it. */
    name: string;
    header: string;
    width?: number;
    value?: (raw: Record<string, unknown>) => unknown;
  }>;
}

/**
 * A page's configured fields, matched to real columns. Fields whose `name` is
 * not a real column on the target table (layout-only or renamed entries) are
 * skipped rather than throwing — a stale config row should not take the whole
 * export down with it.
 */
async function loadPageFields(exec: Database | Transaction, slug: string): Promise<{
  target: NonNullable<ReturnType<typeof getPageTarget>>;
  title: string;
  fields: FieldDef[];
  columnsByName: Map<string, PgColumn>;
}> {
  const target = getPageTarget(slug);
  if (!target) throw new Error(`Unknown page: ${slug}`);

  const [pageRow] = await exec
    .select({ id: masterPage.id, title: masterPage.title })
    .from(masterPage)
    .where(eq(masterPage.slug, slug))
    .limit(1);
  if (!pageRow) throw new Error(`Unknown page: ${slug}`);

  const fieldRows = await exec
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
  const seen = new Set<string>();
  for (const f of fieldRows) {
    if (!columnsByName.has(f.name) || seen.has(f.name)) continue;
    seen.add(f.name);
    fields.push(f as FieldDef);
  }
  return { target, title: pageRow.title, fields, columnsByName };
}

/**
 * Id → label maps for every select field, over the given rows. One lookup per
 * distinct source, not per row — a 90-column export over a few thousand rows
 * would otherwise issue hundreds of thousands of queries.
 */
async function resolveLabelMaps(
  exec: Database | Transaction,
  fields: FieldDef[],
  rows: unknown[],
): Promise<Map<string, Map<string, string>>> {
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

    const lookup = await exec
      .select({ id: cols.id, label: cols.label })
      .from(cols.id.table)
      .where(inArray(cols.id, ids));
    labelMaps.set(
      f.name,
      new Map(lookup.map((l) => [String(l.id), String(l.label ?? '')])),
    );
  }
  return labelMaps;
}

/**
 * One record of a page as its form shows it: every column of the target table,
 * with each configured field rendered the way the export renders it — a select
 * by its label, a date as DD-MM-YYYY. The stage messages fill their `{token}`s
 * from this, so a template says "CLEARING COMPLETED", not "6".
 *
 * Takes the executor so it can run inside the transaction that has just
 * written the record — a separate connection would not see it yet.
 */
export async function pageRecordDisplay(
  exec: Database | Transaction,
  slug: string,
  id: number,
): Promise<{ title: string; raw: Record<string, unknown>; values: Record<string, string> } | null> {
  const { target, title, fields, columnsByName } = await loadPageFields(exec, slug);
  const idColumn = columnsByName.get('id');
  if (!idColumn) return null;
  const [raw] = await exec
    .select(Object.fromEntries(columnsByName) as Record<string, PgColumn>)
    .from(target.table)
    .where(eq(idColumn, id))
    .limit(1);
  if (!raw) return null;
  const row = raw as Record<string, unknown>;
  const labelMaps = await resolveLabelMaps(exec, fields, [row]);
  const byName = new Map(fields.map((f) => [f.name, f]));

  const values: Record<string, string> = {};
  for (const name of columnsByName.keys()) {
    const field = byName.get(name) ?? { name, label: name, fieldType: '', optionsSource: null, optionsLabelField: null, optionsStatic: null };
    values[name] = cell(row[name], field, labelMaps.get(name));
  }
  return { title, raw: row, values };
}

/** Every field on a page, for every matching row, as one spreadsheet sheet. */
export async function buildPageExportSheet(
  slug: string,
  opts: PageExportOptions = {},
): Promise<XlsxSheet> {
  const { target, title, fields, columnsByName } = await loadPageFields(db, slug);
  const selection: Record<string, PgColumn> = {};
  for (const f of fields) selection[f.name] = columnsByName.get(f.name) as PgColumn;

  // The id is not a form field but every export wants it as the row's handle.
  const idColumn = columnsByName.get('id');
  if (idColumn) selection.id = idColumn;

  // Extra columns the page does not define. Selected even when only the tone
  // rule reads them; one that names no real column is dropped rather than
  // producing invalid SQL, matching how unknown page fields are handled above.
  const extras = (opts.extraColumns ?? []).filter((e) => columnsByName.has(e.name));
  for (const e of extras) selection[e.name] = columnsByName.get(e.name) as PgColumn;

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

  const labelMaps = await resolveLabelMaps(db, fields, rows);

  const columns: XlsxColumn[] = [
    { key: 'id', header: 'ID', width: 8 },
    ...fields.map((f) => ({ key: f.name, header: f.label, width: widthFor(f.fieldType) })),
    ...extras.map((e) => ({ key: e.name, header: e.header, width: e.width ?? 16 })),
  ];

  // The tone is decided from the raw row and remembered by the formatted row's
  // id, so `rowTone` below can answer without re-deriving anything.
  const toneById = new Map<unknown, XlsxRowTone | null>();
  const sheetRows = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { id: r.id };
    for (const f of fields) out[f.name] = cell(r[f.name], f, labelMaps.get(f.name));
    // After the page fields, so an extra may override one that shares its name.
    for (const e of extras) out[e.name] = e.value ? e.value(r) : r[e.name];
    if (opts.rowTone) toneById.set(r.id, opts.rowTone(r));
    return out;
  });

  return {
    name: opts.sheetName ?? title,
    columns,
    rows: sheetRows,
    ...(opts.rowTone ? { rowTone: (row: Record<string, unknown>) => toneById.get(row.id) ?? null } : {}),
  };
}
