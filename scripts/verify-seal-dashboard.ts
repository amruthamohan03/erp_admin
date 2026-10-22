/**
 * Read-only smoke test for the Seal Tracker dashboard's aggregates.
 *
 * Runs every query the three tabs and the export workbook use, prints the
 * headline figures, and cross-checks the ones that must agree — including the
 * totals the Seals list's cards read from /api/v1/seals/stats, restated here
 * independently so a drift between the two screens is caught.
 *
 *   npx tsx --env-file=.env.local scripts/verify-seal-dashboard.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSealBatches, getSealStock, getSealUsage } from '@/db/queries/sealDashboardTabs';
import { buildSealDashboardExport } from '@/db/queries/sealDashboardExport';
import { splitSeals } from '@/db/queries/sealUsage';
import { buildXlsx } from '@/lib/xlsx';
import { SEAL_EXPORT_SCOPES } from '@/schemas/seal-dashboard';

interface StatsTotals {
  total_seals: number;
  added_seals: number;
  used_seals: number;
  damaged_seals: number;
}

async function main(): Promise<void> {
  const problems: string[] = [];
  const check = (label: string, a: number, b: number): void => {
    if (Math.abs(a - b) > 0.005) problems.push(`${label}: ${a} vs ${b}`);
  };
  const sum = <T,>(rows: T[], f: (r: T) => number): number => rows.reduce((s, r) => s + f(r), 0);

  // ── Stock ────────────────────────────────────────────────────────────────
  const st = await getSealStock();
  const k = st.kpi;
  console.log('\nSTOCK kpi', k, 'threshold', st.low_stock_threshold);
  check('available+used+damaged = registered', k.available + k.used + k.damaged, k.registered);
  check('register rows = registered', st.seals.length, k.registered);
  for (const s of ['Available', 'Used', 'Damaged'] as const) {
    check(`register ${s} rows = card`, st.seals.filter((r) => r.status === s).length,
      s === 'Available' ? k.available : s === 'Used' ? k.used : k.damaged);
  }
  check('office purchased = purchased', sum(st.offices, (o) => o.purchased), k.purchased);
  check('office registered = registered', sum(st.offices, (o) => o.registered), k.registered);
  check('office available = available', sum(st.offices, (o) => o.available), k.available);
  check('office used = used', sum(st.offices, (o) => o.used), k.used);
  check('office damaged = damaged', sum(st.offices, (o) => o.damaged), k.damaged);
  check('office batches = batches', sum(st.offices, (o) => o.batches), k.batches);
  check('office spend = spend', sum(st.offices, (o) => o.spend_usd), k.spend_usd);
  for (const o of st.offices) {
    check(`${o.office_name} available+used+damaged = registered`, o.available + o.used + o.damaged, o.registered);
    if (o.low_stock !== o.available < st.low_stock_threshold) problems.push(`${o.office_name} low_stock flag wrong`);
  }
  console.log('offices', st.offices.map((o) => `${o.office_name}: A${o.available}/U${o.used}/D${o.damaged}${o.low_stock ? ' LOW' : ''}`).join(' | '));
  console.log('monthly', st.monthly.map((m) => `${m.month_short}:${m.purchased}/${m.used}`).join(' '));

  // The Seals list's own query — restated, not imported, so it is an
  // independent witness.
  const statsRes = await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(total_seal) FROM seal_batch_t WHERE display = 'Y'), 0)::int AS total_seals,
      (SELECT COUNT(*)::int FROM seal_number_t sn JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y') AS added_seals,
      (SELECT COUNT(*)::int FROM seal_number_t sn JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y' AND sn.status = 'Used') AS used_seals,
      (SELECT COUNT(*)::int FROM seal_number_t sn JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y' AND sn.status = 'Damaged') AS damaged_seals`);
  const stats = (statsRes.rows as unknown as StatsTotals[])[0];
  console.log('seals/stats', stats);
  check('stats total_seals = purchased', stats.total_seals, k.purchased);
  check('stats added_seals = registered', stats.added_seals, k.registered);
  check('stats used_seals = used', stats.used_seals, k.used);
  check('stats damaged_seals = damaged', stats.damaged_seals, k.damaged);

  // ── Batches ──────────────────────────────────────────────────────────────
  const b = await getSealBatches();
  check('batch rows = batches', b.batches.length, k.batches);
  check('batch total_seal = purchased', sum(b.batches, (x) => x.total_seal), k.purchased);
  check('batch registered = registered', sum(b.batches, (x) => x.registered), k.registered);
  check('batch used = used', sum(b.batches, (x) => x.used), k.used);
  check('batch spend = spend', sum(b.batches, (x) => x.total_amount), k.spend_usd);
  for (const x of b.batches) {
    check(`batch #${x.id} counts = registered`, x.available + x.used + x.damaged, x.registered);
    check(`batch #${x.id} register rows`, st.seals.filter((s) => s.batch_id === x.id).length, x.registered);
  }
  console.log('batches', b.batches.map((x) => `#${x.id} ${x.office_name} $${x.total_amount} ${x.used_pct.toFixed(1)}%`).join(' | '));

  // ── Usage ────────────────────────────────────────────────────────────────
  const u = await getSealUsage();
  console.log('\nUSAGE kpi', u.kpi);
  check('file seal_count sum = seal entries', sum(u.files, (f) => f.seal_count), u.kpi.seal_entries);
  check('file rows = files with seals', u.files.length, u.kpi.files_with_seals);
  check('client seals = seal entries', sum(u.clients, (c) => c.seals), u.kpi.seal_entries);
  check('client files = files', sum(u.clients, (c) => c.files), u.kpi.files_with_seals);
  check('client rows = clients', u.clients.filter((c) => c.client_id !== null).length, u.kpi.clients);
  check('office damage used = used', sum(u.office_damage, (o) => o.used), k.used);
  check('office damage damaged = damaged', sum(u.office_damage, (o) => o.damaged), k.damaged);
  // The SQL split must agree with the TypeScript one the export save uses.
  for (const f of u.files) {
    check(`${f.mca_ref} SQL split = splitSeals`, f.seal_count, new Set(splitSeals(f.seals)).size);
  }
  console.log('files', u.files.map((f) => `${f.mca_ref}[${f.seals}]`).join(' | '));
  console.log('usage monthly', u.monthly.map((m) => `${m.month_short}:${m.seals}/${m.files}`).join(' '));
  console.log('damage monthly', u.damage_monthly.map((m) => `${m.month_short}:${m.used}/${m.damaged}`).join(' '));

  // ── Exports ──────────────────────────────────────────────────────────────
  for (const scope of SEAL_EXPORT_SCOPES) {
    const { sheets, filename } = await buildSealDashboardExport({ scope });
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
