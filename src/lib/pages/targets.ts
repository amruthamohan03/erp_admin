// §4.12 runtime — server-side whitelist mapping each page slug to the Drizzle
// table object it targets. Never derive table identifiers from request data;
// always look them up here. New transactional pages MUST be added here before
// the runtime can read/write them.
import { sql, getTableColumns } from 'drizzle-orm';
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
