// Baseline an existing (push-created) database onto the migration journal.
// Run with:  npm run db:baseline
//
// Why this exists: early in the project the schema was applied with
// `drizzle-kit push`, which creates the tables but never records anything in
// drizzle.__drizzle_migrations. Such a database already has every table, yet
// `db:migrate` would try to replay 0000 from scratch and fail on
// "already exists". This script marks migrations 0000..N as already applied by
// inserting the exact (hash, created_at) rows drizzle would have written, so a
// subsequent `db:migrate` is a clean no-op and future migrations apply normally.
//
// It does NOT touch your schema or data — only the migration bookkeeping table.
// It is idempotent: rows already present (matched by hash) are left alone, so
// it is safe to run on a partially- or fully-migrated database too.
//
// Hash algorithm mirrors drizzle-orm's readMigrationFiles():
//   sha256( fs.readFileSync(<tag>.sql).toString() ).digest('hex')
// Computing it here, on your machine, keeps it correct regardless of whether
// the working copy checked out with LF or CRLF line endings.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Tiny .env.local parser — no dotenv dependency, matches scripts/seed-admin.js.
// Existing process.env wins, so PGDATABASE overrides still work.
function loadEnv(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv('.env.local');

const MIGRATIONS_FOLDER = 'drizzle';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

function readMigrations() {
  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  return journal.entries.map((entry) => {
    const sqlPath = path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`);
    const query = fs.readFileSync(sqlPath).toString();
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash('sha256').update(query).digest('hex'),
    };
  });
}

async function main() {
  const migrations = readMigrations();
  console.log(`[baseline] read ${migrations.length} migrations from ${MIGRATIONS_FOLDER}/`);

  const client = new Client({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();
  console.log(`[baseline] connected to ${process.env.PGDATABASE}`);

  await client.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );

  const existing = await client.query(
    `SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  const known = new Set(existing.rows.map((r) => r.hash));

  let inserted = 0;
  for (const m of migrations) {
    if (known.has(m.hash)) continue;
    await client.query(
      `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ($1, $2)`,
      [m.hash, m.when],
    );
    inserted += 1;
    console.log(`[baseline] recorded ${m.tag}`);
  }

  await client.end();
  console.log('');
  console.log(
    `[baseline] done — ${inserted} recorded, ${migrations.length - inserted} already present.`,
  );
  console.log('[baseline] `npm run db:migrate` should now be a no-op.');
}

main().catch((err) => {
  console.error('[baseline] error:', err.message);
  process.exit(1);
});
