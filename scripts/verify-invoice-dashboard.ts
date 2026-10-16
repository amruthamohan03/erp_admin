/**
 * Read-only smoke test for the Export / Import Invoice dashboards' aggregates.
 *
 * Runs every query the four tabs and the export workbook use, for both kinds,
 * prints the headline figures, and cross-checks the ones that must agree — a
 * card and the rows it reveals are counted by one rule, so a mismatch here is a
 * bug rather than a rounding difference.
 *
 *   npx tsx --env-file=.env.local scripts/verify-invoice-dashboard.ts
 */
import {
  getInvoiceClients,
  getInvoiceOverview,
  getInvoicePayment,
  getInvoiceValidation,
} from '@/db/queries/invoiceDashboardTabs';
import { buildInvoiceDashboardExport } from '@/db/queries/invoiceDashboardExport';
import { buildXlsx } from '@/lib/xlsx';
import { INVOICE_EXPORT_SCOPES, INVOICE_KINDS } from '@/schemas/invoice-dashboard';

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number, b: number): void => {
    // Money is compared to the cent; counts are whole.
    if (Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };

  for (const kind of INVOICE_KINDS) {
    const o = await getInvoiceOverview(kind);
    console.log(`\n${kind.toUpperCase()} kpi`, o.kpi);
    check(`${kind} rows = total`, o.rows.length, o.kpi.total);
    check(`${kind} row sum = total_usd`, o.rows.reduce((s, r) => s + r.total, 0), o.kpi.total_usd);
    check(
      `${kind} status cards = total`,
      o.kpi.not_validated + o.kpi.validated + o.kpi.dgi_pending + o.kpi.dgi_verified,
      o.kpi.total,
    );
    check(`${kind} status donut = total`, o.status.reduce((s, x) => s + x.count, 0), o.kpi.total);
    check(`${kind} this month rows`, o.rows.filter((r) => ['TODAY', 'THISWEEK', 'THISMONTH'].includes(r.period_flag)).length, o.kpi.this_month);
    console.log(`${kind} monthly`, o.monthly.map((m) => `${m.month_short}:${m.count}`).join(' '));

    const c = await getInvoiceClients(kind);
    check(`${kind} clients value = total_usd`, c.total_usd, o.kpi.total_usd);
    check(`${kind} clients count = total`, c.clients.reduce((s, x) => s + x.count, 0), o.kpi.total);
    console.log(`${kind} top clients`, c.clients.slice(0, 3).map((x) => `${x.client_name}:${x.value_usd.toFixed(2)}`));

    const v = await getInvoiceValidation(kind);
    check(`${kind} pending = total - verified`, v.pending.length, o.kpi.total - o.kpi.dgi_verified);
    check(`${kind} ageing = pending`, v.ageing.reduce((s, a) => s + a.count, 0), v.pending.length);
    console.log(`${kind} ageing`, v.ageing.map((a) => `${a.label}:${a.count}`).join(' '));

    const p = await getInvoicePayment(kind);
    check(`${kind} payment count = total`, p.modes.reduce((s, m) => s + m.count, 0), o.kpi.total);
    check(`${kind} payment value = total_usd`, p.modes.reduce((s, m) => s + m.value_usd, 0), o.kpi.total_usd);
    console.log(`${kind} modes`, p.modes.map((m) => `${m.label}:${m.count}`).join(' '));

    for (const scope of INVOICE_EXPORT_SCOPES) {
      const { sheets, filename } = await buildInvoiceDashboardExport(kind, { scope });
      const buf = await buildXlsx(sheets);
      console.log(`${kind} export ${scope}: ${filename} — ${sheets.length} sheet(s), ${buf.length} bytes`);
    }
  }

  if (problems.length > 0) {
    console.error('\nMISMATCHES:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('\nAll cross-checks agree.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
