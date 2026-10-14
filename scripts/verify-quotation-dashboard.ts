/**
 * Read-only smoke test for the Quotation dashboard's aggregates.
 *
 * Runs every query the four tabs and the export workbook use, prints the
 * headline figures, and cross-checks the ones that must agree — the card and
 * the rows it reveals are counted by one rule, so a mismatch here is a bug
 * rather than a rounding difference.
 *
 *   npx tsx --env-file=.env.local scripts/verify-quotation-dashboard.ts
 */
import {
  getQuotationCategories,
  getQuotationClientDetail,
  getQuotationClients,
  getQuotationOverview,
  getQuotationValue,
} from '@/db/queries/quotationDashboardTabs';
import { buildQuotationDashboardExport } from '@/db/queries/quotationDashboardExport';

const money = (n: number): string => n.toFixed(2);

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number, b: number): void => {
    // Money is compared to the cent; counts are whole.
    if (Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };

  const o = await getQuotationOverview();
  console.log('OVERVIEW kpi', o.kpi);
  console.log('  rows', o.rows.length, '| monthly', o.monthly.length,
    '| kind', o.kind.length, '| transport', o.transport.length, '| goods', o.goods.length);
  console.log('  sample row', o.rows[0]);

  // Every period card must reveal exactly as many rows as it counted.
  const p = (flags: string[]): number => o.rows.filter((r) => flags.includes(r.period_flag)).length;
  check('today', o.kpi.today, p(['TODAY']));
  check('this_week', o.kpi.this_week, p(['TODAY', 'THISWEEK']));
  check('this_month', o.kpi.this_month, p(['TODAY', 'THISWEEK', 'THISMONTH']));
  check('this_year', o.kpi.this_year, p(['TODAY', 'THISWEEK', 'THISMONTH', 'THISYEAR']));

  // Sub total + VAT + ARSP must be the total, or the Value tab's donut lies.
  check('composition', o.kpi.sub_total_usd + o.kpi.vat_usd + o.kpi.arsp_usd, o.kpi.total_usd);

  const v = await getQuotationValue();
  console.log('VALUE kpi', {
    ...v.kpi,
    total_usd: money(v.kpi.total_usd),
    median_usd: money(v.kpi.median_usd),
  });
  console.log('  bands', v.bands, '| top', v.top.length, '| rows', v.rows.length);

  // The bands are disjoint, so they must add up to the whole book.
  check('band counts', v.bands.reduce((n, b) => n + b.count, 0), o.kpi.total);
  check('band value', v.bands.reduce((n, b) => n + b.value_usd, 0), o.kpi.total_usd);
  // And each row's band must match the band it was counted into.
  for (const b of v.bands) {
    check(`band ${b.band} rows`, b.count, v.rows.filter((r) => r.value_band === b.band).length);
  }

  const c = await getQuotationCategories();
  console.log('CATEGORIES kpi', c.kpi);
  console.log('  categories', c.categories.length, '| items', c.items.length, '| units', c.units.length);
  for (const cat of c.categories) console.log('   ', cat);
  check('category lines', c.categories.reduce((n, x) => n + x.lines, 0), c.kpi.lines);

  const cl = await getQuotationClients();
  console.log('CLIENTS stats', cl.stats, '| clients', cl.clients.length);
  check('client totals', cl.clients.reduce((n, x) => n + x.total, 0), o.kpi.total);
  check('client value', cl.clients.reduce((n, x) => n + x.value_usd, 0), o.kpi.total_usd);

  if (cl.clients[0]) {
    const d = await getQuotationClientDetail(cl.clients[0].id);
    console.log('DETAIL', d?.short_name, {
      total: d?.total, value: money(d?.value_usd ?? 0), lines: d?.lines,
      recent: d?.recent.length,
      breakdowns: Object.entries(d?.breakdowns ?? {}).map(([k, b]) => `${k}:${b.length}`).join(' '),
    });
    check('detail total', d?.total ?? 0, cl.clients[0].total);
    check('detail value', d?.value_usd ?? 0, cl.clients[0].value_usd);
  }

  for (const scope of ['dashboard', 'quotations', 'categories'] as const) {
    const x = await buildQuotationDashboardExport({ scope });
    console.log('EXPORT', scope, x.filename, x.sheets.map((s) => `${s.name}(${s.rows.length})`).join(' '));
  }

  if (problems.length > 0) {
    console.error('\nMISMATCHES:');
    for (const m of problems) console.error('  ✗', m);
    process.exit(1);
  }
  console.log('\nAll cross-checks agree.');
  process.exit(0);
}

void main();
