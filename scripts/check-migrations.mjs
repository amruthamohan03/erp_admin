// Diagnostic + manual migration applier. Reads .env.local, connects with the
// same pg config the app uses.
//
// Run with:
//   node scripts/check-migrations.mjs                  # report state only
//   node scripts/check-migrations.mjs apply-next       # dry-run next pending (rollback)
//   node scripts/check-migrations.mjs apply-all        # actually apply all pending, in order
//
// `apply-all` writes to drizzle.__drizzle_migrations (sha256 of file content)
// so drizzle-kit won't re-try migrations we've manually applied.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
dotenvConfig({ path: join(repoRoot, '.env.local') });
dotenvConfig({ path: join(repoRoot, '.env') });

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const journalPath = join(repoRoot, 'drizzle', 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

async function readApplied() {
  try {
    const r = await pool.query(
      'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC',
    );
    return r.rows;
  } catch (err) {
    console.error('Could not read drizzle.__drizzle_migrations:', err.message);
    console.error('  (If this fails, drizzle has never applied a migration on this DB.)');
    return null;
  }
}

function tagToFilename(tag) {
  return join(repoRoot, 'drizzle', `${tag}.sql`);
}

async function main() {
  console.log('--- Migration journal (file system) ---');
  console.log('Total migrations on disk:', journal.entries.length);
  console.log(
    'Last 5:',
    journal.entries.slice(-5).map((e) => `#${e.idx} ${e.tag}`).join(', '),
  );

  const applied = await readApplied();
  console.log();
  console.log('--- Applied (database) ---');
  if (applied === null) {
    console.log('drizzle migrations table is missing or unreadable.');
  } else if (applied.length === 0) {
    console.log('drizzle migrations table exists but is empty — no migrations applied yet.');
  } else {
    console.log(`Applied count: ${applied.length}`);
    console.log('Last 5:');
    for (const row of applied.slice(-5)) {
      console.log(`  #${row.id} hash=${row.hash.slice(0, 16)}... at ${formatTs(row.created_at)}`);
    }
  }

  // Figure out the next pending migration: the journal entry whose hash doesn't
  // appear in applied. We don't try to compute the hash here (drizzle's hash
  // covers more than the file content); instead we go by count + sequence.
  const appliedCount = applied?.length ?? 0;
  const nextEntry = journal.entries[appliedCount];

  console.log();
  if (!nextEntry) {
    console.log('No pending migrations — journal and DB are in sync.');
    await pool.end();
    return;
  }
  console.log(`Next pending migration (by count): ${nextEntry.tag}`);
  const sqlPath = tagToFilename(nextEntry.tag);
  if (!existsSync(sqlPath)) {
    console.log(`  ! SQL file missing on disk: ${sqlPath}`);
    await pool.end();
    return;
  }
  console.log(`  SQL file: ${sqlPath}`);

  // Treat these SQLSTATEs as "already done, continue":
  //   42P07 = duplicate_table          (CREATE TABLE for an existing table)
  //   42710 = duplicate_object         (constraint/index already exists)
  //   42P06 = duplicate_schema
  //   42701 = duplicate_column         (column already exists)
  //   42P16 = invalid_table_definition (e.g. dropping a non-existent constraint)
  const SKIPPABLE_SQLSTATES = new Set(['42P07', '42710', '42P06', '42701', '42P16']);
  const skipExisting = process.argv.includes('--skip-existing');

  if (process.argv.includes('apply-all')) {
    console.log();
    console.log(
      `--- Applying all pending migrations (real commits)${skipExisting ? ', skipping already-existing objects' : ''} ---`,
    );
    const pending = journal.entries.slice(appliedCount);
    if (pending.length === 0) {
      console.log('Nothing to apply.');
      await pool.end();
      return;
    }
    console.log(`${pending.length} migration(s) to apply: ${pending.map((e) => e.tag).join(', ')}`);
    console.log();

    let successCount = 0;
    for (const entry of pending) {
      const sqlPath = tagToFilename(entry.tag);
      if (!existsSync(sqlPath)) {
        console.log(`  SKIP ${entry.tag} — SQL file missing on disk`);
        break;
      }
      const sql = readFileSync(sqlPath, 'utf8');
      const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
      // drizzle-kit's hash format for __drizzle_migrations.hash.
      const hash = createHash('sha256').update(sql).digest('hex');

      const client = await pool.connect();
      let skippedInThisMigration = 0;
      try {
        await client.query('BEGIN');
        for (let i = 0; i < statements.length; i++) {
          // SAVEPOINT lets us recover from a skippable failure without aborting
          // the whole transaction. A rolled-back savepoint releases its work
          // but the outer transaction continues normally.
          const savepoint = `stmt_${i + 1}`;
          await client.query(`SAVEPOINT ${savepoint}`);
          try {
            await client.query(statements[i]);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          } catch (err) {
            if (skipExisting && err.code && SKIPPABLE_SQLSTATES.has(err.code)) {
              skippedInThisMigration++;
              await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              continue;
            }
            console.log(`  FAIL ${entry.tag}  statement ${i + 1}/${statements.length}`);
            console.log('    Error:   ', err.message);
            if (err.code) console.log('    SQLSTATE:', err.code);
            if (err.detail) console.log('    Detail:  ', err.detail);
            if (err.hint) console.log('    Hint:    ', err.hint);
            console.log('    Failing statement (first 500 chars):');
            console.log('    ' + statements[i].slice(0, 500).replace(/\n/g, '\n    '));
            await client.query('ROLLBACK');
            throw err;
          }
        }
        // Record in drizzle's tracking table so drizzle-kit doesn't re-try this.
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()],
        );
        await client.query('COMMIT');
        successCount++;
        console.log(
          `  ok  ${entry.tag}${skippedInThisMigration > 0 ? `  (${skippedInThisMigration} statement(s) skipped as already-existing)` : ''}`,
        );
      } catch {
        console.log();
        console.log(`Stopped after ${successCount} successful migration(s).`);
        console.log(`Failing migration: ${entry.tag}`);
        client.release();
        await pool.end();
        return;
      }
      client.release();
    }

    console.log();
    console.log(`Done — applied ${successCount} migration(s).`);
    await pool.end();
    return;
  }

  if (process.argv.includes('apply-next')) {
    console.log();
    console.log('--- Attempting to apply next migration ---');
    const sql = readFileSync(sqlPath, 'utf8');
    // drizzle splits on the literal "--> statement-breakpoint" marker; we do the
    // same so a single statement-level error points at the right block.
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    console.log(`  Statements in this migration: ${statements.length}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < statements.length; i++) {
        try {
          await client.query(statements[i]);
          console.log(`  ok  [${i + 1}/${statements.length}]`);
        } catch (err) {
          console.log(`  FAIL [${i + 1}/${statements.length}]`);
          console.log('  Error:', err.message);
          if (err.code) console.log('  SQLSTATE:', err.code);
          if (err.detail) console.log('  Detail:', err.detail);
          if (err.hint) console.log('  Hint:', err.hint);
          if (err.position) console.log('  Position:', err.position);
          console.log();
          console.log('  Failing statement (first 500 chars):');
          console.log(statements[i].slice(0, 500));
          await client.query('ROLLBACK');
          throw err;
        }
      }
      await client.query('ROLLBACK'); // dry run — don't actually commit
      console.log();
      console.log('All statements succeeded in dry-run (rolled back).');
      console.log('Run `pnpm db:migrate` again — it should now apply this one and continue.');
    } catch {
      // already reported above
    } finally {
      client.release();
    }
  } else {
    console.log();
    console.log('To dry-run-apply this next migration with full error reporting, run:');
    console.log('  node scripts/check-migrations.mjs apply-next');
  }

  await pool.end();
}

// Drizzle stores created_at in __drizzle_migrations as a bigint of millis,
// not a timestamp — so cast safely instead of calling .toISOString().
function formatTs(v) {
  if (v == null) return 'null';
  if (v instanceof Date) return v.toISOString();
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(n) && n > 0) {
    try { return new Date(n).toISOString(); } catch { /* fall through */ }
  }
  return String(v);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
