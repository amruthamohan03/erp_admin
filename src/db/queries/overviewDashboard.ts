import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, licenseT, localsT } from '@/db/schema';
import { fileNotCancelled } from './fileCancellation';
import { kindUseForOrMissing } from './kindScope';
import { IS_EXPIRED, IS_EXPIRING, IS_LIVE } from './licenseFilters';
import { loadPaymentStages } from './paymentStages';
import { paymentStatusSql } from './payments';

// §4.29 — the home dashboard: what the whole operation looks like today.
//
// The per-module dashboards answer "what needs attention in THIS module". This
// answers the question somebody has when they sign in — where is the work, is
// it moving, what is waiting on a signature, and is anything about to lapse —
// across all three tracking modules, licences, invoices, payments and clients
// at once.
//
// Every predicate is the one its own module already uses: a cancelled file is
// excluded through `fileNotCancelled`, a file belongs to a side through the
// kind's flags (§4.1), a licence's status is `licenseFilters`, and a payment's
// stage is the same `paymentStatusSql` the payments grid derives its badge
// from. Nothing is re-derived here, so no figure on this screen can contradict
// the module it summarises (§4.10).
//
// One rule holds throughout the SQL below: the tracking tables are NEVER
// aliased. The shared predicates render fully-qualified column names
// (`"imports_t"."display"`), and aliasing the table makes Postgres reject
// those — `invalid reference to FROM-clause entry`, which took the whole
// endpoint down once already.

export interface OverviewKpi {
  imports_open: number;
  imports_total: number;
  exports_open: number;
  exports_total: number;
  locals_open: number;
  locals_total: number;
  licenses_active: number;
  licenses_expiring: number;
  licenses_expired: number;
  payments_open: number;
  payments_open_amount: number;
  invoices_pending: number;
  invoices_validated: number;
  clients_active: number;
  users_active: number;
}

export interface OverviewDashboard {
  kpi: OverviewKpi;
  /** Files opened per month, one series per tracking module. */
  monthly: Array<{
    month: string;
    month_name: string;
    imports: number;
    exports: number;
    locals: number;
  }>;
  /** Clearing status, split by module — "where is everything" at a glance. */
  status_split: Array<{ status: string | null; imports: number; exports: number; locals: number }>;
  expiry_outlook: Array<{ label: string; days: number; count: number }>;
  top_clients: Array<{ client_name: string | null; total: number }>;
  /** Declared value entering the pipeline each month. */
  monthly_value: Array<{ month: string; month_name: string; fob: number }>;
  /** Invoices by side and state — what still needs validating. */
  invoice_split: Array<{ label: string; value: number }>;
}

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** Statuses that take a file off the desk. */
const CLEARED = sql`(
  SELECT id FROM clearing_status_master_t
   WHERE upper(clearing_status) IN ('CLEARING COMPLETED', 'CLEARED WITH IR', 'CLEARED WITH ARA'))`;

export async function getOverviewDashboard(): Promise<OverviewDashboard> {
  const openImports = sql`${importT.display} = 'Y'
    AND ${kindUseForOrMissing(importT.kind, 'import')}
    AND ${fileNotCancelled(importT.clearingStatus)}
    AND (${importT.clearingStatus} IS NULL OR ${importT.clearingStatus} NOT IN ${CLEARED})`;
  const openExports = sql`${exportT.display} = 'Y'
    AND ${kindUseForOrMissing(exportT.kind, 'export')}
    AND ${fileNotCancelled(exportT.clearingStatus)}
    AND (${exportT.clearingStatus} IS NULL OR ${exportT.clearingStatus} NOT IN ${CLEARED})`;
  // Local tracking carries no kind — it is neither an import nor an export, so
  // there is no direction flag to ask (§4.1). Everything else matches.
  const openLocals = sql`${localsT.display} = 'Y'
    AND ${fileNotCancelled(localsT.clearingStatus)}
    AND (${localsT.clearingStatus} IS NULL OR ${localsT.clearingStatus} NOT IN ${CLEARED})`;

  const stages = await loadPaymentStages();
  const paymentState = paymentStatusSql(stages, 'pr');

  const [kpi] = rowsOf<OverviewKpi>(
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM ${importT} WHERE ${openImports})::int AS imports_open,
        (SELECT count(*) FROM ${importT}
          WHERE ${importT.display} = 'Y'
            AND ${kindUseForOrMissing(importT.kind, 'import')})::int AS imports_total,
        (SELECT count(*) FROM ${exportT} WHERE ${openExports})::int AS exports_open,
        (SELECT count(*) FROM ${exportT}
          WHERE ${exportT.display} = 'Y'
            AND ${kindUseForOrMissing(exportT.kind, 'export')})::int AS exports_total,
        (SELECT count(*) FROM ${localsT} WHERE ${openLocals})::int AS locals_open,
        (SELECT count(*) FROM ${localsT} WHERE ${localsT.display} = 'Y')::int AS locals_total,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${licenseT.display} = 'Y' AND ${IS_LIVE})::int AS licenses_active,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${licenseT.display} = 'Y' AND ${IS_EXPIRING})::int AS licenses_expiring,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${licenseT.display} = 'Y' AND ${IS_EXPIRED})::int AS licenses_expired,
        (SELECT count(*) FROM payment_request_t pr
          WHERE pr.display = 'Y'
            AND ${paymentState} NOT IN ('paid', 'rejected'))::int AS payments_open,
        (SELECT COALESCE(SUM(pr.amount), 0) FROM payment_request_t pr
          WHERE pr.display = 'Y'
            AND ${paymentState} NOT IN ('paid', 'rejected'))::float AS payments_open_amount,
        ((SELECT count(*) FROM import_invoices_t WHERE display = 'Y' AND validated = 0)
         + (SELECT count(*) FROM export_invoices_t WHERE display = 'Y' AND validated = 0))::int
           AS invoices_pending,
        ((SELECT count(*) FROM import_invoices_t WHERE display = 'Y' AND validated = 1)
         + (SELECT count(*) FROM export_invoices_t WHERE display = 'Y' AND validated = 1))::int
           AS invoices_validated,
        (SELECT count(*) FROM client_master_t WHERE display = 'Y')::int AS clients_active,
        (SELECT count(*) FROM users_t WHERE display = 'Y')::int AS users_active`),
  );

  // Twelve months including the empty ones — a quiet month is information, and
  // a chart that omits it draws a straight line through it.
  const monthsCte = sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month') AS m
    )`;

  const monthly = rowsOf<{
    month: string;
    month_name: string;
    imports: number;
    exports: number;
    locals: number;
  }>(
    await db.execute(sql`
      ${monthsCte}
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             to_char(months.m, 'Mon') AS month_name,
             (SELECT count(*) FROM ${importT}
               WHERE ${importT.display} = 'Y'
                 AND date_trunc('month', ${importT.preAlertDate}) = months.m)::int AS imports,
             (SELECT count(*) FROM ${exportT}
               WHERE ${exportT.display} = 'Y'
                 AND date_trunc('month', ${exportT.loadingDate}) = months.m)::int AS exports,
             (SELECT count(*) FROM ${localsT}
               WHERE ${localsT.display} = 'Y'
                 AND date_trunc('month', ${localsT.loadingDate}) = months.m)::int AS locals
        FROM months
       ORDER BY months.m`),
  );

  const monthlyValue = rowsOf<{ month: string; month_name: string; fob: number }>(
    await db.execute(sql`
      ${monthsCte}
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             to_char(months.m, 'Mon') AS month_name,
             (COALESCE((SELECT SUM(${importT.fob}) FROM ${importT}
                         WHERE ${importT.display} = 'Y'
                           AND date_trunc('month', ${importT.preAlertDate}) = months.m), 0)
              + COALESCE((SELECT SUM(${exportT.fob}) FROM ${exportT}
                         WHERE ${exportT.display} = 'Y'
                           AND date_trunc('month', ${exportT.loadingDate}) = months.m), 0))::float AS fob
        FROM months
       ORDER BY months.m`),
  );

  const statusSplit = rowsOf<{
    status: string | null;
    imports: number;
    exports: number;
    locals: number;
  }>(
    await db.execute(sql`
      SELECT m.clearing_status AS status,
             (SELECT count(*) FROM ${importT}
               WHERE ${importT.display} = 'Y' AND ${importT.clearingStatus} = m.id)::int AS imports,
             (SELECT count(*) FROM ${exportT}
               WHERE ${exportT.display} = 'Y' AND ${exportT.clearingStatus} = m.id)::int AS exports,
             (SELECT count(*) FROM ${localsT}
               WHERE ${localsT.display} = 'Y' AND ${localsT.clearingStatus} = m.id)::int AS locals
        FROM clearing_status_master_t m
       WHERE m.display = 'Y'
       ORDER BY m.id`),
  );

  // DISJOINT bands, each licence counted once — "what lapses in this window".
  //
  // The licence dashboard's own outlook is cumulative, which answers a different
  // question ("how much of the book lapses by X"). Cumulative is wrong here:
  // with a small book every horizon returns the same number and the chart
  // renders four identical bars, which reads as broken rather than as one
  // problem getting closer. Disjoint bands differ from each other and are what
  // an operator actually acts on — and `Expired` leads, because a lapsed
  // licence is blocking work right now rather than approaching.
  const outlook = rowsOf<{ label: string; days: number; count: number }>(
    await db.execute(sql`
      SELECT b.label, b.days,
             (SELECT count(*) FROM ${licenseT}
               WHERE ${licenseT.display} = 'Y' AND ${licenseT.status} = 'ACTIVE'
                 AND ${licenseT.licenseExpiryDate} IS NOT NULL
                 AND CASE
                       WHEN b.days < 0 THEN ${licenseT.licenseExpiryDate} < current_date
                       ELSE ${licenseT.licenseExpiryDate}
                            BETWEEN current_date + (b.lo || ' days')::interval
                                AND current_date + (b.days || ' days')::interval
                     END)::int AS count
        FROM (VALUES ('Expired', -1, -1),
                     ('Within 7 days', 0, 7),
                     ('8 – 30 days', 8, 30),
                     ('31 – 60 days', 31, 60),
                     ('61 – 90 days', 61, 90)) AS b(label, lo, days)
       ORDER BY b.lo`),
  );

  // §4.15 — the client is a column on someone else's row here, so the code.
  const topClients = rowsOf<{ client_name: string | null; total: number }>(
    await db.execute(sql`
      SELECT c.short_name AS client_name,
             ((SELECT count(*) FROM ${importT}
                WHERE ${importT.clientId} = c.id AND (${openImports}))
              + (SELECT count(*) FROM ${exportT}
                WHERE ${exportT.clientId} = c.id AND (${openExports}))
              + (SELECT count(*) FROM ${localsT}
                WHERE ${localsT.clientId} = c.id AND (${openLocals})))::int AS total
        FROM client_master_t c
       WHERE c.display = 'Y'
       ORDER BY total DESC
       LIMIT 6`),
  );

  const [inv] = rowsOf<{
    import_pending: number;
    import_validated: number;
    export_pending: number;
    export_validated: number;
  }>(
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM import_invoices_t WHERE display = 'Y' AND validated = 0)::int AS import_pending,
        (SELECT count(*) FROM import_invoices_t WHERE display = 'Y' AND validated = 1)::int AS import_validated,
        (SELECT count(*) FROM export_invoices_t WHERE display = 'Y' AND validated = 0)::int AS export_pending,
        (SELECT count(*) FROM export_invoices_t WHERE display = 'Y' AND validated = 1)::int AS export_validated`),
  );

  return {
    kpi: {
      imports_open: kpi?.imports_open ?? 0,
      imports_total: kpi?.imports_total ?? 0,
      exports_open: kpi?.exports_open ?? 0,
      exports_total: kpi?.exports_total ?? 0,
      locals_open: kpi?.locals_open ?? 0,
      locals_total: kpi?.locals_total ?? 0,
      licenses_active: kpi?.licenses_active ?? 0,
      licenses_expiring: kpi?.licenses_expiring ?? 0,
      licenses_expired: kpi?.licenses_expired ?? 0,
      payments_open: kpi?.payments_open ?? 0,
      payments_open_amount: kpi?.payments_open_amount ?? 0,
      invoices_pending: kpi?.invoices_pending ?? 0,
      invoices_validated: kpi?.invoices_validated ?? 0,
      clients_active: kpi?.clients_active ?? 0,
      users_active: kpi?.users_active ?? 0,
    },
    monthly,
    monthly_value: monthlyValue,
    status_split: statusSplit.filter((s) => s.imports + s.exports + s.locals > 0),
    expiry_outlook: outlook,
    top_clients: topClients.filter((c) => c.total > 0),
    invoice_split: [
      { label: 'Import · validated', value: inv?.import_validated ?? 0 },
      { label: 'Import · pending', value: inv?.import_pending ?? 0 },
      { label: 'Export · validated', value: inv?.export_validated ?? 0 },
      { label: 'Export · pending', value: inv?.export_pending ?? 0 },
    ].filter((s) => s.value > 0),
  };
}
