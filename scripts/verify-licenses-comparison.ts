/**
 * Read-only smoke test for the Licence comparison dashboard.
 *
 * Runs the comparison in all four modes on the local database, prints each
 * slice's figures, and cross-checks the ones that must agree:
 *
 *  * import + export add up to the unsliced figure for every additive metric —
 *    exactly when no licence in range has a kind flagged for both sides or no
 *    kind at all (those count twice / never, by design);
 *  * two identical periods give identical values;
 *  * a client or post slice never exceeds the unsliced figure;
 *  * the monthly series sums to the headline and covers every month.
 *
 *   npx tsx --env-file=.env.local scripts/verify-licenses-comparison.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runComparison } from '@/db/queries/comparisonEngine';
import { licensesComparison as mod } from '@/db/queries/comparison/licensesComparison';
import { comparisonQuerySchema } from '@/schemas/comparison';

const ADDITIVE = ['raised', 'weight', 'fob_usd', 'validated', 'expiring', 'expired', 'active', 'files'];

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number | null, b: number | null): void => {
    if (Math.abs((a ?? 0) - (b ?? 0)) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };

  const from = '2025-01-01';
  const to = '2026-12-31';
  const all = await mod.measure({ from, to });
  console.log('ALL', all);

  // Monthly covers every month and sums to the headline.
  const months = await mod.monthly({ from, to });
  check('monthly length', months.length, 24);
  check('monthly sum = raised', months.reduce((s, m) => s + m.value, 0), all.raised);

  // ---- period
  const period = await runComparison(
    mod,
    comparisonQuerySchema.parse({ mode: 'period', a_from: from, a_to: to, b_from: from, b_to: to }),
    'period',
  );
  const [a, b] = period.slices;
  for (const m of mod.metrics) check(`A==B ${m.key}`, a?.values[m.key] ?? null, b?.values[m.key] ?? null);
  for (const m of mod.metrics) check(`period A = measure ${m.key}`, a?.values[m.key] ?? null, all[m.key] ?? null);
  const dflt = await runComparison(mod, comparisonQuerySchema.parse({ mode: 'period' }), 'period');
  console.log('\nPERIOD (defaults)', dflt.slices.map((s) => ({ label: s.label, detail: s.detail, raised: s.values.raised })));

  // ---- direction
  const dir = await runComparison(mod, comparisonQuerySchema.parse({ mode: 'direction', from, to }), 'direction');
  console.log('\nDIRECTION', dir.slices.map((s) => ({ key: s.key, ...s.values })));
  const [odd] = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM license_t l
        LEFT JOIN kind_master_t k ON k.id = l.kind_id
       WHERE l.display = 'Y'
         AND (k.id IS NULL OR (k.use_for_import AND k.use_for_export)
              OR NOT (k.use_for_import OR k.use_for_export))`)
  ).rows as Array<{ n: number }>;
  if ((odd?.n ?? 0) === 0) {
    for (const key of ADDITIVE) {
      check(`import+export = all ${key}`, dir.slices.reduce((s, x) => s + (x.values[key] ?? 0), 0), all[key] ?? null);
    }
  } else {
    console.log(`(skipping direction additivity: ${odd?.n} licence(s) with a both-sides or missing kind)`);
  }

  // ---- client
  const cl = await runComparison(mod, comparisonQuerySchema.parse({ mode: 'client', from, to }), 'client');
  console.log('\nCLIENT', cl.autoPicked, cl.slices.map((s) => ({ label: s.label, ...s.values })));
  for (const s of cl.slices) {
    for (const key of ADDITIVE) {
      if ((s.values[key] ?? 0) > (all[key] ?? 0) + 0.005) problems.push(`client ${s.label} ${key} > all`);
    }
  }
  const allClients = await mod.topClients(from, to, 1000);
  check('client slices sum = raised', (await Promise.all(allClients.map((id) => mod.measure({ from, to, clientId: id }))))
    .reduce((s, v) => s + (v.raised ?? 0), 0), all.raised);

  // ---- office
  const off = await runComparison(mod, comparisonQuerySchema.parse({ mode: 'office', from, to }), 'office');
  console.log('\nOFFICE', off.available.officeLabel, `${off.available.offices.length} posts`, off.autoPicked,
    off.slices.map((s) => ({ label: s.label, ...s.values })));
  for (const s of off.slices) {
    for (const key of ADDITIVE) {
      if ((s.values[key] ?? 0) > (all[key] ?? 0) + 0.005) problems.push(`office ${s.label} ${key} > all`);
    }
  }

  // An empty window is all zeros / nulls, never an error.
  const empty = await mod.measure({ from: '1990-01-01', to: '1990-12-31' });
  check('empty raised', empty.raised, 0);
  if (empty.utilisation !== null || empty.avg_validation_days !== null) problems.push('empty window has a ratio');

  console.log(problems.length ? `\nFAIL\n  ${problems.join('\n  ')}` : '\nOK — every cross-check holds');
  process.exitCode = problems.length ? 1 : 0;
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 300));
