/**
 * Read-only smoke test for the Client Comparison dashboard.
 *
 * Runs all four comparison modes against the local database, prints each
 * slice's headline figures, and cross-checks the ones that must agree — the
 * slices are measured by one rule, so a mismatch here is a bug, not rounding.
 *
 *   npx tsx --env-file=.env.local scripts/verify-clients-comparison.ts
 */
import { runComparison } from '@/db/queries/comparisonEngine';
import { clientsComparison as mod } from '@/db/queries/comparison/clientsComparison';
import { comparisonQuerySchema } from '@/schemas/comparison';
import type { ComparisonResult } from '@/lib/comparison';

const FROM = '2025-01-01';
const TO = '2026-12-31';

async function run(params: Record<string, string>): Promise<ComparisonResult> {
  const q = comparisonQuerySchema.parse(params);
  return runComparison(mod, q, q.mode);
}

const v = (r: ComparisonResult, i: number, key: string): number | null => r.slices[i]?.values[key] ?? null;

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number | null, b: number | null): void => {
    if (a === null || b === null || Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };
  const atMost = (label: string, a: number, b: number | null): void => {
    if (b === null || a > b + 0.005) problems.push(`${label}: ${a} > ${b}`);
  };
  const print = (r: ComparisonResult): void => {
    for (const s of r.slices) {
      console.log(`  ${s.label.padEnd(14)} ${s.detail}`);
      console.log('   ', JSON.stringify(s.values));
      console.log('    monthly', s.monthly.map((m) => `${m.month}:${m.value}`).join(' '));
    }
    if (r.autoPicked) console.log('  autoPicked:', r.autoPicked);
  };

  // Period — identical windows must give identical values; the overall window is the baseline.
  const period = await run({ mode: 'period', a_from: FROM, a_to: TO, b_from: FROM, b_to: TO });
  console.log('\nPERIOD (A == B)');
  print(period);
  const overall = period.slices[0]?.values ?? {};
  for (const m of mod.metrics) {
    const a = v(period, 0, m.key);
    const b = v(period, 1, m.key);
    if (a !== b) problems.push(`period A==B ${m.key}: ${a} vs ${b}`);
  }
  const total = overall.total_files ?? null;
  check('total = import + export', total, (overall.import_files ?? 0) + (overall.export_files ?? 0));
  check(
    'monthly sum = total files',
    period.slices[0]?.monthly.reduce((s, m) => s + m.value, 0) ?? 0,
    total,
  );
  const months = period.slices[0]?.monthly.length ?? 0;
  if (months !== 24) problems.push(`monthly covers ${months} months, expected 24 (zero months included)`);

  // Period — split windows add up.
  const split = await run({ mode: 'period', a_from: FROM, a_to: '2025-12-31', b_from: '2026-01-01', b_to: TO });
  console.log('\nPERIOD (2025 vs 2026)');
  print(split);
  for (const key of ['total_files', 'import_files', 'export_files', 'licences', 'weight_kg', 'fob_usd', 'billed_usd', 'new_clients']) {
    check(`split periods ${key}`, (v(split, 0, key) ?? 0) + (v(split, 1, key) ?? 0), overall[key] ?? null);
  }

  // Direction — the two sides partition the files, weight, FOB and billing.
  const dir = await run({ mode: 'direction', from: FROM, to: TO });
  console.log('\nDIRECTION');
  print(dir);
  for (const key of ['total_files', 'weight_kg', 'fob_usd', 'billed_usd']) {
    check(`import + export ${key}`, (v(dir, 0, key) ?? 0) + (v(dir, 1, key) ?? 0), overall[key] ?? null);
  }
  check('import side total = import files', v(dir, 0, 'total_files'), overall.import_files ?? null);
  check('export side total = export files', v(dir, 1, 'total_files'), overall.export_files ?? null);
  if (v(dir, 0, 'export_files') !== null || v(dir, 1, 'import_files') !== null) problems.push('excluded side should be null');
  if (v(dir, 0, 'new_clients') !== null) problems.push('new_clients should be null in direction mode');

  // Client — auto-picked busiest clients; their slices are a subset of the whole.
  const client = await run({ mode: 'client', from: FROM, to: TO });
  console.log('\nCLIENT (auto-pick)');
  print(client);
  for (const key of ['total_files', 'licences', 'weight_kg', 'fob_usd', 'billed_usd']) {
    atMost(`client slices ${key} ≤ overall`, client.slices.reduce((s, x) => s + (x.values[key] ?? 0), 0), overall[key] ?? null);
  }
  for (const s of client.slices) {
    if (s.values.active_clients !== null || s.values.new_clients !== null) problems.push(`${s.label}: active/new clients should be null`);
  }
  const ranked = client.slices.map((s) => s.values.total_files ?? 0);
  if (ranked.some((n, i) => i > 0 && n > (ranked[i - 1] ?? 0))) problems.push(`auto-picked clients not ranked: ${ranked.join(',')}`);

  // Office — clients in an office are a subset of all clients.
  const office = await run({ mode: 'office', from: FROM, to: TO });
  console.log('\nOFFICE (auto-pick)');
  console.log('  offices available:', office.available.offices.map((o) => `${o.id}:${o.label}`).join(', '));
  print(office);
  for (const key of ['total_files', 'active_clients', 'licences', 'billed_usd', 'new_clients']) {
    atMost(`office slices ${key} ≤ overall`, office.slices.reduce((s, x) => s + (x.values[key] ?? 0), 0), overall[key] ?? null);
  }
  const allOffices = await run({ mode: 'office', from: FROM, to: TO, office_ids: office.available.offices.slice(0, 5).map((o) => o.id).join(',') });
  console.log('  explicit offices:', allOffices.slices.map((s) => `${s.label}=${s.values.total_files}`).join(' '));

  if (problems.length > 0) {
    console.error('\nMISMATCHES:');
    for (const m of problems) console.error('  ✗', m);
    setTimeout(() => process.exit(1), 300);
    return;
  }
  console.log('\nAll cross-checks agree.');
  setTimeout(() => process.exit(0), 300);
}

main().catch((err: unknown) => {
  console.error(err);
  setTimeout(() => process.exit(1), 300);
});
