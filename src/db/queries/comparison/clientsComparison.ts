import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster, currencyMaster, exportT, importT, licenseT, mainOfficeMaster } from '@/db/schema';
import type { MetricDef, MonthPoint } from '@/lib/comparison';
import type { ComparisonModule, SliceFilter } from '../comparisonEngine';
import { invoiceBase } from '../invoiceDashboardTabs';
import { licenseUseForCondition } from '../licenseFilters';

// §4.29 — what the Client Comparison dashboard measures for one slice.
//
// The engine decides the slices (two periods, a handful of clients, import
// against export, a handful of offices); this module only says how to measure
// one of them. Every figure is a SQL aggregate over live rows (`display = 'Y'`,
// §4.27), dated by `created_at` — the date each list shows and filters by — so a
// figure here and the list it summarises agree on which window a row is in.
//
// The office dimension is the CLIENT's location (`client_master_t.
// office_location_id`, the "Location" on the client form, which reads the main
// office master). A slice for an office covers the files, licences and invoices
// of the clients located there — not the customs office a file was declared at.
// The client scope is read without a `display` filter: a soft-deleted client's
// past files are still history (§4.27).

type Side = 'import' | 'export';
const SIDES: readonly Side[] = ['import', 'export'];

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** The sides a slice covers — both, unless its direction names one. */
const sidesOf = (f: SliceFilter): Side[] => SIDES.filter((s) => !f.direction || f.direction === s);

const inWindow = (opened: SQL, f: SliceFilter): SQL =>
  sql`${opened} BETWEEN ${f.from}::date AND ${f.to}::date`;

/** Narrows a row's client column by the slice's client and office. */
function clientScope(clientCol: SQL, f: SliceFilter): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.clientId !== undefined) parts.push(sql`${clientCol} = ${f.clientId}`);
  if (f.officeId !== undefined) {
    parts.push(sql`${clientCol} IN (
      SELECT ${clientMaster.id} FROM ${clientMaster} WHERE ${clientMaster.officeLocationId} = ${f.officeId})`);
  }
  return sql.join(parts, sql` AND `);
}

const USD = sql`(SELECT ${currencyMaster.id} FROM ${currencyMaster} WHERE upper(${currencyMaster.currencyShortName}) = 'USD')`;

/**
 * One row per live tracking file in the slice, normalised across the two
 * tables: imports are weighed in KG, exports in MT (the export screens label
 * it so), so export weight is converted to kg here rather than added raw. FOB
 * is kept only where the file's currency is USD — summing francs into dollars
 * would be a number nobody could defend.
 */
function files(f: SliceFilter): SQL {
  const branches = sidesOf(f).map((side): SQL => {
    if (side === 'import') {
      const opened = sql`${importT.createdAt}::date`;
      return sql`
        SELECT 'import'::text AS side, ${importT.clientId} AS client_id, ${opened} AS opened,
               ${importT.weight}::numeric AS weight_kg,
               CASE WHEN ${importT.fobCurrency} IN ${USD} THEN ${importT.fob} END::numeric AS fob_usd,
               (${importT.dgdaOutDate} - ${importT.dgdaInDate}) AS days
          FROM ${importT}
         WHERE ${importT.display} = 'Y' AND ${inWindow(opened, f)} AND ${clientScope(sql`${importT.clientId}`, f)}`;
    }
    const opened = sql`${exportT.createdAt}::date`;
    return sql`
      SELECT 'export'::text AS side, ${exportT.clientId} AS client_id, ${opened} AS opened,
             (${exportT.weight} * 1000)::numeric AS weight_kg,
             CASE WHEN ${exportT.currency} IN ${USD} THEN ${exportT.fob} END::numeric AS fob_usd,
             (${exportT.dgdaOutDate} - ${exportT.dgdaInDate}) AS days
        FROM ${exportT}
       WHERE ${exportT.display} = 'Y' AND ${inWindow(opened, f)} AND ${clientScope(sql`${exportT.clientId}`, f)}`;
  });
  if (branches.length === 0) {
    // A direction this module does not know — an empty set, not every file.
    return sql`SELECT NULL::text AS side, NULL::int AS client_id, NULL::date AS opened,
                      NULL::numeric AS weight_kg, NULL::numeric AS fob_usd, NULL::int AS days WHERE false`;
  }
  return sql.join(branches, sql` UNION ALL `);
}

/** Licences raised in the slice; a direction keeps licences whose kind serves that side. */
function licences(f: SliceFilter): SQL {
  const sides = sidesOf(f);
  const direction = f.direction
    ? sides.length === 1
      ? licenseUseForCondition(sides[0] as Side)
      : sql`false`
    : sql`true`;
  return sql`
    SELECT count(*)::int FROM ${licenseT}
     WHERE ${licenseT.display} = 'Y'
       AND ${inWindow(sql`${licenseT.createdAt}::date`, f)}
       AND ${clientScope(sql`${licenseT.clientId}`, f)}
       AND ${direction}`;
}

/** Billed USD — the invoice dashboard's own total rule, per side. */
function billed(f: SliceFilter): SQL {
  const branches = sidesOf(f).map(
    (side) => sql`
      SELECT b.total FROM (${invoiceBase(side)}) b
       WHERE ${inWindow(sql`b.inv_date`, f)} AND ${clientScope(sql`b.client_id`, f)}`,
  );
  if (branches.length === 0) return sql`SELECT 0::float`;
  return sql`SELECT COALESCE(SUM(t.total), 0)::float FROM (${sql.join(branches, sql` UNION ALL `)}) t`;
}

/** Clients onboarded in the window — only meaningful across all clients and both sides. */
function newClients(f: SliceFilter): SQL {
  return sql`
    SELECT count(*)::int FROM ${clientMaster}
     WHERE ${clientMaster.display} = 'Y'
       AND ${inWindow(sql`${clientMaster.createdAt}::date`, f)}
       ${f.officeId !== undefined ? sql`AND ${clientMaster.officeLocationId} = ${f.officeId}` : sql``}`;
}

const metrics: MetricDef[] = [
  { key: 'total_files', label: 'Total files', format: 'count', better: 'up', hint: 'Import and export tracking files opened in the period.' },
  { key: 'import_files', label: 'Import files', format: 'count', better: 'up', hint: 'Import tracking files opened in the period.' },
  { key: 'export_files', label: 'Export files', format: 'count', better: 'up', hint: 'Export tracking files opened in the period.' },
  { key: 'active_clients', label: 'Active clients', format: 'count', better: 'up', hint: 'Clients with at least one tracking file opened in the period.' },
  { key: 'new_clients', label: 'New clients', format: 'count', better: 'up', hint: 'Clients onboarded (created) in the period.' },
  { key: 'licences', label: 'Licences raised', format: 'count', better: 'neutral', hint: 'Licences created in the period; by direction, those whose kind serves that side.' },
  { key: 'weight_kg', label: 'Weight handled', format: 'kg', better: 'up', hint: 'Sum of file weights — import KG plus export MT converted to kg.' },
  { key: 'fob_usd', label: 'FOB (USD)', format: 'usd', better: 'up', hint: 'FOB of files whose currency is USD; other currencies are left out, not converted.' },
  { key: 'billed_usd', label: 'Billed (USD)', format: 'usd', better: 'up', hint: 'Import and export invoice totals raised in the period, as the invoice dashboards total them.' },
  { key: 'avg_clearance_days', label: 'Avg clearance days', format: 'days', better: 'down', hint: 'DGDA In to DGDA Out, over files opened in the period that have both dates.' },
];

export const clientsComparison: ComparisonModule = {
  metrics,
  headline: 'total_files',
  officeLabel: 'Office Location',
  directions: [
    { key: 'import', label: 'Import' },
    { key: 'export', label: 'Export' },
  ],

  async offices(): Promise<Array<{ id: number; label: string }>> {
    return rowsOf<{ id: number; label: string }>(
      await db.execute(sql`
        SELECT ${mainOfficeMaster.id} AS id, COALESCE(${mainOfficeMaster.mainLocationName}, 'Office #' || ${mainOfficeMaster.id}) AS label
          FROM ${mainOfficeMaster}
         WHERE ${mainOfficeMaster.display} = 'Y'
         ORDER BY ${mainOfficeMaster.id}`),
    );
  },

  async measure(f): Promise<Record<string, number | null>> {
    const sides = sidesOf(f);
    const [row] = rowsOf<{
      import_files: number;
      export_files: number;
      total_files: number;
      active_clients: number;
      weight_kg: number;
      fob_usd: number;
      avg_clearance_days: number | null;
      licences: number;
      billed_usd: number;
      new_clients: number;
    }>(
      await db.execute(sql`
        SELECT count(*) FILTER (WHERE fl.side = 'import')::int AS import_files,
               count(*) FILTER (WHERE fl.side = 'export')::int AS export_files,
               count(*)::int AS total_files,
               count(DISTINCT fl.client_id)::int AS active_clients,
               COALESCE(SUM(fl.weight_kg), 0)::float AS weight_kg,
               COALESCE(SUM(fl.fob_usd), 0)::float AS fob_usd,
               AVG(fl.days)::float AS avg_clearance_days,
               (${licences(f)}) AS licences,
               (${billed(f)}) AS billed_usd,
               (${newClients(f)}) AS new_clients
          FROM (${files(f)}) fl`),
    );
    if (!row) return {};
    const days = row.avg_clearance_days;
    return {
      total_files: row.total_files,
      // A side the slice excludes has no count, rather than a misleading 0.
      import_files: sides.includes('import') ? row.import_files : null,
      export_files: sides.includes('export') ? row.export_files : null,
      // One client is always "1 active client" — not a comparison.
      active_clients: f.clientId !== undefined ? null : row.active_clients,
      // Onboarding has no side and belongs to no one client.
      new_clients: f.clientId !== undefined || f.direction !== undefined ? null : row.new_clients,
      licences: row.licences,
      weight_kg: row.weight_kg,
      fob_usd: row.fob_usd,
      billed_usd: row.billed_usd,
      avg_clearance_days: days === null ? null : Math.round(days * 10) / 10,
    };
  },

  async monthly(f): Promise<MonthPoint[]> {
    return rowsOf<MonthPoint>(
      await db.execute(sql`
        SELECT to_char(g.m, 'YYYY-MM') AS month, count(fl.opened)::int AS value
          FROM generate_series(date_trunc('month', ${f.from}::timestamp),
                               date_trunc('month', ${f.to}::timestamp),
                               interval '1 month') AS g(m)
          LEFT JOIN (${files(f)}) fl ON date_trunc('month', fl.opened::timestamp) = g.m
         GROUP BY g.m
         ORDER BY g.m`),
    );
  },

  async topClients(from, to, n): Promise<number[]> {
    return rowsOf<{ id: number }>(
      await db.execute(sql`
        SELECT fl.client_id AS id
          FROM (${files({ from, to })}) fl
         WHERE fl.client_id IS NOT NULL
         GROUP BY fl.client_id
         ORDER BY count(*) DESC, fl.client_id
         LIMIT ${n}`),
    ).map((r) => r.id);
  },

  async topOffices(from, to, n): Promise<number[]> {
    return rowsOf<{ id: number }>(
      await db.execute(sql`
        SELECT o.id
          FROM (${files({ from, to })}) fl
          JOIN ${clientMaster} c ON c.id = fl.client_id
          JOIN ${mainOfficeMaster} o ON o.id = c.office_location_id AND o.display = 'Y'
         GROUP BY o.id
         ORDER BY count(*) DESC, o.id
         LIMIT ${n}`),
    ).map((r) => r.id);
  },
};
