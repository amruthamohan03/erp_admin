/**
 * Read-only smoke test for the Tracking Comparison dashboard.
 *
 * Runs the comparison in all four modes against the local database, prints the
 * slices, and cross-checks the figures that must agree — a mismatch is a bug in
 * a slice's scope, not a rounding difference.
 *
 *   npx tsx --env-file=.env.local scripts/verify-tracking-comparison.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runComparison, defaultWindows } from '@/db/queries/comparisonEngine';
import { trackingComparison as mod } from '@/db/queries/comparison/trackingComparison';
import { comparisonQuerySchema } from '@/schemas/comparison';
import type { ComparedSlice } from '@/lib/comparison';

const ADDITIVE = ['files', 'cleared', 'cancelled', 'open', 'weight', 'fob'] as const;

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number | null, b: number | null): void => {
    if (a === null || b === null ? a !== b : Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };
  const show = (s: ComparedSlice): void =>
    console.log(`  ${s.label} (${s.detail})`, JSON.stringify(s.values), s.monthly.map((m) => `${m.month}:${m.value}`).join(' '));

  // A window wide enough to hold every live file, so "all" is everything.
  const span = (await db.execute(sql`
    SELECT to_char(LEAST((SELECT min(created_at) FROM imports_t), (SELECT min(created_at) FROM exports_t)), 'YYYY-MM-DD') AS lo,
           to_char(current_date, 'YYYY-MM-DD') AS hi`)) as unknown as { rows: Array<{ lo: string | null; hi: string }> };
  const from = span.rows[0]?.lo ?? defaultWindows().from;
  const to = span.rows[0]?.hi ?? defaultWindows().to;
  console.log(`window ${from} .. ${to}`);

  const all = await mod.measure({ from, to });
  console.log('ALL', JSON.stringify(all));

  // Raw totals straight from the tables, independent of the module's base.
  const raw = (await db.execute(sql`
    SELECT (SELECT count(*) FROM imports_t WHERE display = 'Y' AND created_at::date BETWEEN ${from}::date AND ${to}::date)::int AS imp,
           (SELECT count(*) FROM exports_t WHERE display = 'Y' AND created_at::date BETWEEN ${from}::date AND ${to}::date)::int AS exp`)) as unknown as {
    rows: Array<{ imp: number; exp: number }>;
  };
  check('all files = raw imports + exports', all.files ?? 0, (raw.rows[0]?.imp ?? 0) + (raw.rows[0]?.exp ?? 0));
  check('cleared + cancelled + open = files', (all.cleared ?? 0) + (all.cancelled ?? 0) + (all.open ?? 0), all.files ?? 0);

  const run = (params: Record<string, string>) => runComparison(mod, comparisonQuerySchema.parse(params), params.mode ?? '');

  // Period — the same window twice must give identical slices.
  const period = await run({ mode: 'period', a_from: from, a_to: to, b_from: from, b_to: to });
  console.log('\nPERIOD (A == B)');
  period.slices.forEach(show);
  const [pa, pb] = period.slices;
  for (const m of mod.metrics) check(`period A==B ${m.key}`, pa?.values[m.key] ?? null, pb?.values[m.key] ?? null);
  check('period A = all files', pa?.values.files ?? null, all.files ?? null);
  check('monthly sums to files', pa?.monthly.reduce((s, x) => s + x.value, 0) ?? 0, all.files ?? 0);

  const defaults = await run({ mode: 'period' });
  console.log('\nPERIOD (defaults)');
  defaults.slices.forEach(show);

  // Direction — import + export add up to the combined figure.
  const dir = await run({ mode: 'direction', from, to });
  console.log('\nDIRECTION');
  dir.slices.forEach(show);
  check('direction slice count', dir.slices.length, 2);
  for (const k of ADDITIVE) check(`import + export = all (${k})`, dir.slices.reduce((s, x) => s + (x.values[k] ?? 0), 0), all[k] ?? 0);
  check('import files = raw', dir.slices[0]?.values.files ?? 0, raw.rows[0]?.imp ?? 0);
  check('export files = raw', dir.slices[1]?.values.files ?? 0, raw.rows[0]?.exp ?? 0);

  // Client — auto-picked, each slice within the overall figure.
  const client = await run({ mode: 'client', from, to });
  console.log('\nCLIENT', client.autoPicked ?? '');
  client.slices.forEach(show);
  for (const s of client.slices) for (const k of ADDITIVE) if ((s.values[k] ?? 0) > (all[k] ?? 0) + 0.005) problems.push(`client ${s.label} ${k} exceeds all`);
  const clientFiles = client.slices.map((s) => s.values.files ?? 0);
  if (clientFiles.some((v, i) => i > 0 && v > (clientFiles[i - 1] ?? 0))) problems.push('auto-picked clients are not ranked by files');

  // Office — auto-picked, each within overall, and the slices never overlap.
  const office = await run({ mode: 'office', from, to });
  console.log('\nOFFICE', office.autoPicked ?? '', '| available:', office.available.offices.map((o) => o.label).join(', '));
  office.slices.forEach(show);
  for (const k of ADDITIVE) {
    const sum = office.slices.reduce((s, x) => s + (x.values[k] ?? 0), 0);
    if (sum > (all[k] ?? 0) + 0.005) problems.push(`office slices ${k} sum ${sum} exceeds all ${all[k]}`);
  }

  // An explicit office list, including one nobody uses, measures to zero cleanly.
  const ids = office.available.offices.map((o) => o.id).slice(0, 5).join(',');
  if (ids) {
    const explicit = await run({ mode: 'office', from, to, office_ids: ids });
    check('explicit office slices', explicit.slices.length, ids.split(',').length);
    for (const k of ADDITIVE) {
      const sum = explicit.slices.reduce((s, x) => s + (x.values[k] ?? 0), 0);
      if (sum > (all[k] ?? 0) + 0.005) problems.push(`explicit office ${k} sum exceeds all`);
    }
  }

  // An empty window: zero counts, null averages and rates, never NaN.
  const empty = await mod.measure({ from: '1990-01-01', to: '1990-01-31' });
  check('empty files', empty.files ?? -1, 0);
  check('empty clearance rate is null', empty.cleared_pct ?? null, null);
  check('empty avg days is null', empty.avg_clearance_days ?? null, null);
  const unknownDir = await mod.measure({ from, to, direction: 'nowhere' });
  check('unknown direction matches nothing', unknownDir.files ?? -1, 0);

  console.log(problems.length === 0 ? '\nOK — all cross-checks pass' : `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  // Windows loses buffered output if the pool keeps the process alive.
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300));
