/*
 * One-command DB setup for the restructure branch.
 *
 *   pnpm setup:db --from-dump path/to/erp_admin_main.sql
 *   pnpm setup:db --from-db erp_admin_main          # clone a live main DB
 *   add --force to drop & recreate an existing target DB
 *
 * The TARGET database + credentials come from .env.local (DATABASE_URL / PG*).
 * It: creates the target DB, loads main's data, runs scripts/db-reconcile.sql,
 * then reseeds the sidebar + dashboard cards (in-process). Idempotent with --force.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import { seedMenus } from '@/db/seed/menus';
import { seedDashboardCards } from '@/db/seed/dashboardCards';
import {
  menuMaster,
  roleMenuMapping,
  dashboardCardMaster,
  roleDashboardCardMapping,
} from '@/db/schema';

const args = process.argv.slice(2);
const has = (f: string): boolean => args.includes(f);
const val = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main(): Promise<void> {
  const PGHOST = process.env.PGHOST ?? 'localhost';
  const PGPORT = process.env.PGPORT ?? '5432';
  const PGUSER = process.env.PGUSER ?? 'postgres';
  const PGPASSWORD = process.env.PGPASSWORD ?? '';
  const TARGET = process.env.PGDATABASE;
  if (!TARGET) throw new Error('PGDATABASE not set — create .env.local first (see docs/restructure-finalization.md).');

  const fromDump = val('--from-dump');
  const fromDb = val('--from-db');
  if (!fromDump && !fromDb) throw new Error('Provide a source: --from-dump <erp_admin_main.sql> OR --from-db <dbname>');
  if (fromDump && !existsSync(fromDump)) throw new Error(`Dump file not found: ${fromDump}`);

  const resolveTool = (name: string): string => {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
      return name;
    } catch {
      for (const v of ['18', '17', '16', '15', '14']) {
        const p = `C:/Program Files/PostgreSQL/${v}/bin/${name}.exe`;
        if (existsSync(p)) return p;
      }
      throw new Error(`${name} not found. Install the PostgreSQL client tools or add their bin/ to PATH.`);
    }
  };
  const psql = resolveTool('psql');
  const pgdump = fromDb ? resolveTool('pg_dump') : null;

  const env = { ...process.env, PGPASSWORD };
  const base = ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1'];
  const sh = (bin: string, a: string[]): void => {
    execFileSync(bin, a, { env, stdio: ['ignore', 'ignore', 'inherit'], shell: bin === psql || bin === pgdump ? false : process.platform === 'win32' });
  };
  const scalar = (dbName: string, q: string): string =>
    execFileSync(psql, [...base, '-d', dbName, '-tAc', q], { env, encoding: 'utf8' }).trim();

  console.log(`▶ target DB: ${TARGET}  (source: ${fromDump ?? `db:${fromDb}`})`);

  // 1) create / recreate the target database
  const exists = scalar('postgres', `SELECT 1 FROM pg_database WHERE datname='${TARGET}'`) === '1';
  if (exists && !has('--force')) throw new Error(`Database "${TARGET}" already exists. Re-run with --force to drop & recreate.`);
  if (exists) {
    console.log('  dropping existing target…');
    sh(psql, [...base, '-d', 'postgres', '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET}' AND pid<>pg_backend_pid()`]);
    sh(psql, [...base, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${TARGET}`]);
  }
  sh(psql, [...base, '-d', 'postgres', '-c', `CREATE DATABASE ${TARGET}`]);
  console.log('  ✓ created');

  // 2) load main's data
  const tmp = mkdtempSync(join(tmpdir(), 'erp-setup-'));
  try {
    let dumpFile = fromDump;
    if (fromDb) {
      dumpFile = join(tmp, 'main.sql');
      console.log(`  dumping ${fromDb}…`);
      sh(pgdump!, ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '--no-owner', '--no-privileges', '-d', fromDb, '-f', dumpFile]);
    }
    console.log('  loading data…');
    sh(psql, ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', TARGET, '-q', '-f', dumpFile!]);
    console.log('  ✓ loaded');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 3) reconcile names + form config
  sh(psql, [...base, '-d', TARGET, '-f', 'scripts/db-reconcile.sql']);
  console.log('  ✓ reconciled table/column names + form config');

  // 4) reseed navigation + dashboard cards (in-process — db reads .env.local -> TARGET)
  await db.delete(roleMenuMapping);
  await db.delete(menuMaster);
  await seedMenus(db);
  // Orphan sweep: parent groups the seed no longer emits but an older run left
  // behind. The Stage-5 route removals are handled in seedMenus itself now.
  await db.execute(sql`DELETE FROM menu_master_t p WHERE p.menu_id IS NULL AND p.url='#' AND NOT EXISTS (SELECT 1 FROM menu_master_t c WHERE c.menu_id=p.id)`);
  console.log('  ✓ sidebar reseeded');

  await db.delete(roleDashboardCardMapping);
  await db.delete(dashboardCardMaster);
  await seedDashboardCards(db);
  console.log('  ✓ dashboard cards reseeded');

  console.log(`\n✅ ${TARGET} is ready. Start the app with: pnpm dev`);
}

main()
  .catch((err) => {
    console.error('\nsetup:db failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
