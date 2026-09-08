// §4.12 runtime — server-side whitelist mapping each page slug to the Drizzle
// table object it targets. Never derive table identifiers from request data;
// always look them up here. New transactional pages MUST be added here before
// the runtime can read/write them.
import { sql, getTableColumns, type SQL } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
// restructure export names: clientMaster (client_master_t), licenseT (license_t),
// importT (imports_t), exportT (exports_t).
import { clientMaster, licenseT, importT, exportT, paymentRequest, localsT, exportInvoices, importInvoices } from '@/db/schema';

interface PageTarget {
  table: PgTable;
  // The set of allowed column names that fields on this page can reference.
  // Computed from the Drizzle table definition so it stays in sync if the
  // schema changes.
  allowedColumns: Set<string>;
}

const TARGETS: Record<string, PageTarget> = {
  clients: {
    table: clientMaster,
    allowedColumns: new Set(Object.values(getTableColumns(clientMaster)).map((c) => c.name)),
  },
  license: {
    table: licenseT,
    allowedColumns: new Set(Object.values(getTableColumns(licenseT)).map((c) => c.name)),
  },
  import: {
    table: importT,
    allowedColumns: new Set(Object.values(getTableColumns(importT)).map((c) => c.name)),
  },
  export: {
    table: exportT,
    allowedColumns: new Set(Object.values(getTableColumns(exportT)).map((c) => c.name)),
  },
  payment: {
    table: paymentRequest,
    allowedColumns: new Set(Object.values(getTableColumns(paymentRequest)).map((c) => c.name)),
  },
  local: {
    table: localsT,
    allowedColumns: new Set(Object.values(getTableColumns(localsT)).map((c) => c.name)),
  },
  'export-invoices': {
    table: exportInvoices,
    allowedColumns: new Set(Object.values(getTableColumns(exportInvoices)).map((c) => c.name)),
  },
  'import-invoices': {
    table: importInvoices,
    allowedColumns: new Set(Object.values(getTableColumns(importInvoices)).map((c) => c.name)),
  },
};

export function getPageTarget(pageSlug: string): PageTarget | null {
  return TARGETS[pageSlug] ?? null;
}

/**
 * Filter a list of column names down to those actually present in the page's
 * target table. Use this everywhere before letting field names hit a SQL query.
 */
/**
 * Bind ONE page value as a SQL parameter.
 *
 * Everything here goes through `sql` template interpolation, and Drizzle treats a
 * JS ARRAY as a parenthesised parameter list — `($1, $2)` — because that is what
 * an `IN (…)` needs. For a JSONB column that is wrong in both directions:
 *
 *   remarks = []          →  remarks = ()        — a Postgres syntax error
 *   remarks = [ {...} ]   →  remarks = ($1)      — not the array either
 *
 * So every repeating group saved as a JSONB column (§4.5 — the remark log, the
 * payment MCA grid) broke the save of any record that carried one, and an EMPTY
 * log broke it hardest: an export that had never had a remark could not be
 * updated at all.
 *
 * Serialised to JSON text and left UNCAST: the parameter is untyped, so Postgres
 * resolves it against the target column — jsonb where the column is jsonb, text
 * where it is text. A hardcoded `::jsonb` would be right for today's columns and
 * wrong the first time a plain-text column receives a structured value.
 */
export function bindColumnValue(value: unknown): SQL {
  const isPlainObject =
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
  return isPlainObject ? sql`${JSON.stringify(value)}` : sql`${value ?? null}`;
}

export function safeColumnsFor(pageSlug: string, columns: string[]): string[] {
  const target = getPageTarget(pageSlug);
  if (!target) return [];
  return columns.filter((c) => target.allowedColumns.has(c));
}

/**
 * Fetch a single row from the page's target table, restricted to a whitelisted
 * column projection. Returns null if the row is missing.
 *
 * Caller is responsible for passing `safeColumnsFor()`-filtered names.
 */
export async function fetchEntityValues(
  pageSlug: string,
  entityId: number,
  safeColumns: string[],
): Promise<Record<string, unknown> | null> {
  const target = getPageTarget(pageSlug);
  if (!target) return null;

  const projection = sql.join(
    ['id', ...safeColumns].map((c) => sql.identifier(c)),
    sql`, `,
  );

  const result = await db.execute(
    sql`SELECT ${projection} FROM ${target.table} WHERE id = ${entityId} LIMIT 1`,
  );
  const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows;
  return rows?.[0] ?? null;
}
