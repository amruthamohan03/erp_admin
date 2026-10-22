/**
 * Read-only smoke test for the Fiche de Calcul dashboard's aggregates.
 *
 * Runs every query the four tabs and the export workbook use, prints the
 * headline figures, and cross-checks the ones that must agree — a card and the
 * rows it reveals are counted by one rule, so a mismatch here is a bug rather
 * than a rounding difference.
 *
 *   npx tsx --env-file=.env.local scripts/verify-fiche-dashboard.ts
 */
import {
  getFicheClients,
  getFicheDuties,
  getFicheOverview,
  getFicheWorkflowTab,
} from '@/db/queries/ficheDashboardTabs';
import { buildFicheDashboardExport } from '@/db/queries/ficheDashboardExport';
import { buildXlsx } from '@/lib/xlsx';
import { FICHE_EXPORT_SCOPES } from '@/schemas/fiche-dashboard';

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number, b: number): void => {
    // Money is compared to the cent; counts are whole.
    if (Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };

  const o = await getFicheOverview();
  console.log('\nkpi', o.kpi);
  check('rows = total', o.rows.length, o.kpi.total);
  check('row DDI sum = ddi_total', o.rows.reduce((s, r) => s + r.ddi, 0), o.kpi.ddi_total);
  check('state cards = total', o.states.reduce((s, x) => s + x.count, 0), o.kpi.total);
  check('state cards DDI = ddi_total', o.states.reduce((s, x) => s + x.ddi, 0), o.kpi.ddi_total);
  for (const st of o.states) {
    check(`state ${st.label} rows`, o.rows.filter((r) => r.state === st.state).length, st.count);
  }
  check('currency split = total', o.currencies.reduce((s, x) => s + x.count, 0), o.kpi.total);
  check('currency CIF = row CIF', o.currencies.reduce((s, x) => s + x.cif, 0), o.rows.reduce((s, r) => s + r.cif, 0));
  check('regime split = total', o.regimes.reduce((s, x) => s + x.count, 0), o.kpi.total);
  check('transport split = total', o.transports.reduce((s, x) => s + x.count, 0), o.kpi.total);
  check('this month rows', o.rows.filter((r) => ['TODAY', 'THISWEEK', 'THISMONTH'].includes(r.period_flag)).length, o.kpi.this_month);
  check('this year rows', o.rows.filter((r) => r.period_flag !== 'OLDER').length, o.kpi.this_year);
  console.log('states', o.states.map((s) => `${s.label}${s.terminal ? '(end)' : ''}:${s.count}`).join(' '));
  console.log('currencies', o.currencies.map((c) => `${c.label}:${c.cif.toFixed(2)}`).join(' '));
  console.log('monthly', o.monthly.map((m) => `${m.month_short}:${m.count}`).join(' '));

  const w = await getFicheWorkflowTab();
  const openCount = w.states.filter((s) => !s.terminal).reduce((s, x) => s + x.count, 0);
  check('waiting = open-state cards', w.waiting.length, openCount);
  check('ageing = waiting', w.ageing.reduce((s, a) => s + a.count, 0), w.waiting.length);
  check('verifiers = verified', w.verifiers.reduce((s, p) => s + p.count, 0), w.verified);
  check('auditors = audited', w.auditors.reduce((s, p) => s + p.count, 0), w.audited);
  check('verified = kpi verified', w.verified, o.kpi.verified);
  console.log('ageing', w.ageing.map((a) => `${a.label}:${a.count}`).join(' '));
  console.log('avg days', { verify: w.avg_days_to_verify, audit: w.avg_days_to_audit });

  const c = await getFicheClients();
  check('clients DDI = ddi_total', c.ddi_total, o.kpi.ddi_total);
  check('clients count = total', c.count_total, o.kpi.total);
  console.log('top clients', c.clients.slice(0, 3).map((x) => `${x.client_name}:${x.ddi.toFixed(2)}`));

  const d = await getFicheDuties();
  check('HS DDI = ddi_total', d.hs_codes.reduce((s, h) => s + h.ddi, 0), o.kpi.ddi_total);
  check('origin DDI = ddi_total', d.origins.reduce((s, x) => s + x.ddi, 0), o.kpi.ddi_total);
  check('HS lines = lines', d.hs_codes.reduce((s, h) => s + h.lines, 0), d.lines);
  check('lines = kpi lines', d.lines, o.kpi.lines);
  console.log('top HS', d.hs_codes.slice(0, 3).map((h) => `${h.hs_code}:${h.ddi.toFixed(2)}`), 'avg DDI %', d.avg_ddi_percent);

  for (const scope of FICHE_EXPORT_SCOPES) {
    const { sheets, filename } = await buildFicheDashboardExport({ scope });
    const buf = await buildXlsx(sheets);
    console.log(`export ${scope}: ${filename} — ${sheets.length} sheet(s), ${buf.length} bytes`);
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
