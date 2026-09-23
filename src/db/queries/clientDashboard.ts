import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, licenseT } from '@/db/schema';
import { fileNotCancelled } from './fileCancellation';
import { IS_EXPIRING, IS_LIVE } from './licenseFilters';
import { loadPaymentStages } from './paymentStages';
import { paymentStatusSql } from './payments';

// §4.29 — everything the business knows about ONE client, on one screen.
//
// The existing /clients/dashboard reports on the client BASE — how many clients
// of each type, where they are, what payment terms they use. This answers the
// other question, the one an account manager has before a call: what is open for
// THIS client right now, how much licence headroom is left, and what do they owe.
//
// Every figure is a SQL aggregate over live rows (§4.29). Nothing is counted
// from a page of results, and soft-deleted rows are excluded throughout (§4.27)
// — a cancelled file is excluded too, through the same `fileNotCancelled`
// predicate the licence-usage endpoint uses, so headroom here and "Available"
// on the bulk-create screen can never disagree (§4.10).

export interface ClientDashboardKpi {
  imports_open: number;
  imports_total: number;
  exports_open: number;
  exports_total: number;
  licenses_active: number;
  licenses_expiring: number;
  licenses_total: number;
  payments_open: number;
  payments_open_amount: number;
  /** Combined declared FOB still available across this client's live licences. */
  fob_remaining: number | null;
}

export interface ClientDashboard {
  client: {
    id: number;
    short_name: string | null;
    company_name: string | null;
    client_type: string | null;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  kpi: ClientDashboardKpi;
  /** Live licences with how much of each cap is spent — the headroom bars. */
  licences: Array<{
    id: number;
    license_number: string | null;
    kind_name: string | null;
    status: string | null;
    license_expiry_date: string | null;
    fob_cap: number | null;
    fob_used: number;
    weight_cap: number | null;
    weight_used: number;
  }>;
  /** Open files grouped by where they are stuck. */
  files_by_status: Array<{ status: string | null; imports: number; exports: number }>;
  monthly: Array<{ month: string; month_name: string; imports: number; exports: number }>;
  recent_files: Array<{
    id: number;
    kind: 'import' | 'export';
    ref: string | null;
    status: string | null;
    date: string | null;
  }>;
}

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const EMPTY_KPI: ClientDashboardKpi = {
  imports_open: 0,
  imports_total: 0,
  exports_open: 0,
  exports_total: 0,
  licenses_active: 0,
  licenses_expiring: 0,
  licenses_total: 0,
  payments_open: 0,
  payments_open_amount: 0,
  fob_remaining: null,
};

export async function getClientDashboard(clientId: number): Promise<ClientDashboard> {
  const [client] =
    rowsOf<ClientDashboard['client'] & object>(
      await db.execute(sql`
        SELECT id, short_name, company_name, client_type, contact_person, email, phone
          FROM client_master_t
         WHERE id = ${clientId}
         LIMIT 1`),
    );
  if (!client) {
    return { client: null, kpi: EMPTY_KPI, licences: [], files_by_status: [], monthly: [], recent_files: [] };
  }

  // A file is "open" when it is neither cleared nor cancelled. `fileNotCancelled`
  // already excludes the cancelled ones; CLEARING COMPLETED and the two
  // cleared-with variants are what takes it off the desk.
  const openImports = sql`${importT.display} = 'Y' AND ${fileNotCancelled(importT.clearingStatus)}
    AND ${importT.clearingStatus} NOT IN (
      SELECT id FROM clearing_status_master_t
       WHERE upper(clearing_status) IN ('CLEARING COMPLETED', 'CLEARED WITH IR', 'CLEARED WITH ARA'))`;
  const openExports = sql`${exportT.display} = 'Y' AND ${fileNotCancelled(exportT.clearingStatus)}
    AND ${exportT.clearingStatus} NOT IN (
      SELECT id FROM clearing_status_master_t
       WHERE upper(clearing_status) IN ('CLEARING COMPLETED', 'CLEARED WITH IR', 'CLEARED WITH ARA'))`;

  const [fileCounts] = rowsOf<{
    imports_open: number;
    imports_total: number;
    exports_open: number;
    exports_total: number;
  }>(
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM ${importT}
          WHERE ${importT.clientId} = ${clientId} AND (${openImports}))::int AS imports_open,
        (SELECT count(*) FROM ${importT}
          WHERE ${importT.clientId} = ${clientId} AND ${importT.display} = 'Y')::int AS imports_total,
        (SELECT count(*) FROM ${exportT}
          WHERE ${exportT.clientId} = ${clientId} AND (${openExports}))::int AS exports_open,
        (SELECT count(*) FROM ${exportT}
          WHERE ${exportT.clientId} = ${clientId} AND ${exportT.display} = 'Y')::int AS exports_total`),
  );

  const [licenceCounts] = rowsOf<{ active: number; expiring: number; total: number }>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${IS_LIVE})::int AS active,
             count(*) FILTER (WHERE ${IS_EXPIRING})::int AS expiring,
             count(*)::int AS total
        FROM ${licenseT}
       WHERE ${licenseT.clientId} = ${clientId} AND ${licenseT.display} = 'Y'`),
  );

  // Outstanding money: every request that has neither completed its chain nor
  // been rejected. The status is derived by the SAME SQL the payments list and
  // its cards use, so this figure cannot disagree with that screen (§4.10).
  const stages = await loadPaymentStages();
  const status = paymentStatusSql(stages, 'pr');
  const [payments] = rowsOf<{ open_count: number; open_amount: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS open_count,
             COALESCE(SUM(pr.amount), 0)::float AS open_amount
        FROM payment_request_t pr
       WHERE pr.client_id = ${clientId} AND pr.display = 'Y'
         AND ${status} NOT IN ('paid', 'rejected')`),
  );

  // Headroom per licence. Both caps are nullable — a licence with no declared
  // FOB has no ceiling, and reporting that as 0 would read as "fully spent"
  // rather than "uncapped", so it stays null all the way to the UI.
  const licences = rowsOf<{
    id: number;
    license_number: string | null;
    kind_name: string | null;
    status: string | null;
    license_expiry_date: string | null;
    fob_cap: number | null;
    fob_used: number;
    weight_cap: number | null;
    weight_used: number;
  }>(
    await db.execute(sql`
      SELECT l.id,
             l.license_number,
             k.kind_name,
             l.status,
             l.license_expiry_date,
             l.fob_declared::float AS fob_cap,
             l.weight::float AS weight_cap,
             COALESCE((SELECT SUM(i.fob) FROM ${importT} i
                        WHERE i.license_id = l.id AND i.display = 'Y'
                          AND ${fileNotCancelled(sql`i.clearing_status`)}), 0)::float
             + COALESCE((SELECT SUM(e.fob) FROM ${exportT} e
                        WHERE e.license_id = l.id AND e.display = 'Y'
                          AND ${fileNotCancelled(sql`e.clearing_status`)}), 0)::float AS fob_used,
             COALESCE((SELECT SUM(i.weight) FROM ${importT} i
                        WHERE i.license_id = l.id AND i.display = 'Y'
                          AND ${fileNotCancelled(sql`i.clearing_status`)}), 0)::float
             + COALESCE((SELECT SUM(e.weight) FROM ${exportT} e
                        WHERE e.license_id = l.id AND e.display = 'Y'
                          AND ${fileNotCancelled(sql`e.clearing_status`)}), 0)::float AS weight_used
        FROM ${licenseT} l
        LEFT JOIN kind_master_t k ON k.id = l.kind_id
       WHERE l.client_id = ${clientId} AND l.display = 'Y'
       ORDER BY l.license_expiry_date NULLS LAST, l.id DESC
       LIMIT 12`),
  );

  const filesByStatus = rowsOf<{ status: string | null; imports: number; exports: number }>(
    await db.execute(sql`
      SELECT m.clearing_status AS status,
             (SELECT count(*) FROM ${importT} i
               WHERE i.client_id = ${clientId} AND i.display = 'Y' AND i.clearing_status = m.id)::int AS imports,
             (SELECT count(*) FROM ${exportT} e
               WHERE e.client_id = ${clientId} AND e.display = 'Y' AND e.clearing_status = m.id)::int AS exports
        FROM clearing_status_master_t m
       WHERE m.display = 'Y'
       ORDER BY m.id`),
  );

  const monthly = rowsOf<{ month: string; month_name: string; imports: number; exports: number }>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month') AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             to_char(months.m, 'Mon YYYY') AS month_name,
             (SELECT count(*) FROM ${importT} i
               WHERE i.client_id = ${clientId} AND i.display = 'Y'
                 AND date_trunc('month', i.pre_alert_date) = months.m)::int AS imports,
             (SELECT count(*) FROM ${exportT} e
               WHERE e.client_id = ${clientId} AND e.display = 'Y'
                 AND date_trunc('month', e.loading_date) = months.m)::int AS exports
        FROM months
       ORDER BY months.m`),
  );

  // Both sides in one list, newest first — an account manager thinks in terms of
  // "what moved recently", not "what moved recently on the import side".
  const recentFiles = rowsOf<{
    id: number;
    kind: 'import' | 'export';
    ref: string | null;
    status: string | null;
    date: string | null;
  }>(
    await db.execute(sql`
      (SELECT i.id, 'import'::text AS kind, i.mca_ref AS ref,
              m.clearing_status AS status, i.pre_alert_date AS date
         FROM ${importT} i
         LEFT JOIN clearing_status_master_t m ON m.id = i.clearing_status
        WHERE i.client_id = ${clientId} AND i.display = 'Y')
      UNION ALL
      (SELECT e.id, 'export'::text AS kind, e.mca_ref AS ref,
              m.clearing_status AS status, e.loading_date AS date
         FROM ${exportT} e
         LEFT JOIN clearing_status_master_t m ON m.id = e.clearing_status
        WHERE e.client_id = ${clientId} AND e.display = 'Y')
      ORDER BY date DESC NULLS LAST
      LIMIT 10`),
  );

  // Uncapped licences are skipped rather than counted as zero — the total is
  // "headroom we can measure", and one uncapped licence does not make the rest
  // of the book unmeasurable.
  const capped = licences.filter((l) => l.fob_cap !== null);
  const fobRemaining = capped.length
    ? capped.reduce((sum, l) => sum + Math.max(0, (l.fob_cap ?? 0) - l.fob_used), 0)
    : null;

  return {
    client,
    kpi: {
      imports_open: fileCounts?.imports_open ?? 0,
      imports_total: fileCounts?.imports_total ?? 0,
      exports_open: fileCounts?.exports_open ?? 0,
      exports_total: fileCounts?.exports_total ?? 0,
      licenses_active: licenceCounts?.active ?? 0,
      licenses_expiring: licenceCounts?.expiring ?? 0,
      licenses_total: licenceCounts?.total ?? 0,
      payments_open: payments?.open_count ?? 0,
      payments_open_amount: payments?.open_amount ?? 0,
      fob_remaining: fobRemaining,
    },
    licences,
    files_by_status: filesByStatus.filter((s) => s.imports > 0 || s.exports > 0),
    monthly,
    recent_files: recentFiles,
  };
}
