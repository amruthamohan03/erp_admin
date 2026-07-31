/*
 * `npm run db:migrate` — apply pending migrations, and say what went wrong when
 * they don't apply.
 *
 * This wraps the same drizzle-orm migrator `drizzle-kit migrate` uses (same
 * drizzle/ folder, same drizzle.__drizzle_migrations bookkeeping), but reports
 * failures. drizzle-kit swallows them: a database it cannot reach, or a
 * migration that errors, both print nothing beyond the banner and exit 1 —
 * which reads as "db:migrate created no tables" with no way to tell why.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolveDbCredentials } from '@/lib/dbCredentials';

type PgError = Error & { code?: string; detail?: string; hint?: string };

async function main(): Promise<void> {
  const creds = resolveDbCredentials({ required: true });
  console.log(`[migrate] target: ${creds.user}@${creds.host}:${creds.port}/${creds.database}`);

  const pool = new Pool({ ...creds, database: creds.database as string, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: 'drizzle' });

    const { rows } = await pool.query<{ applied: string; tables: string }>(
      `SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations)::text AS applied,
              (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::text AS tables`,
    );
    const row = rows[0];
    console.log(`[migrate] done — ${row?.applied ?? '?'} recorded, ${row?.tables ?? '?'} tables in public.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const e = err as PgError;
  console.error('\n[migrate] FAILED');
  console.error(`  ${e.message}`);
  if (e.code) console.error(`  code:   ${e.code}`);
  if (e.detail) console.error(`  detail: ${e.detail}`);
  if (e.hint) console.error(`  hint:   ${e.hint}`);
  const cause = (err as { cause?: PgError }).cause;
  if (cause?.message && cause.message !== e.message) {
    console.error(`  cause:  ${cause.message}`);
    if (cause.code) console.error(`  code:   ${cause.code}`);
  }
  console.error(
    '\n  If this is a database restored from a dump, its tables already exist and the\n' +
      '  migration chain cannot be replayed — baseline it instead:\n' +
      '    npm run db:baseline -- --through 0043_relax_banklist_bank_code_unique\n' +
      '    npm run db:migrate\n',
  );
  process.exitCode = 1;
});
