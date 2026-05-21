// Seed kind_master_t with the canonical license / consignment kinds.
// Run with:  node scripts/seed-kind-master.js
//
// Upserts by id so re-running is idempotent, then bumps the serial
// sequence past the highest seeded id so future inserts don't collide.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

const ROWS = [
  { id: 1, kindName: 'IMPORT DEFINITVE',  kindShortName: 'ID', createdAt: '2025-11-04 11:43:39', updatedAt: '2025-11-04 11:43:39', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 2, kindName: 'IMPORT TEMPORARY',  kindShortName: 'IT', createdAt: '2025-11-04 11:43:46', updatedAt: '2025-11-04 11:43:46', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 3, kindName: 'EXPORT DEFINITVE',  kindShortName: 'ED', createdAt: '2025-11-04 11:43:54', updatedAt: '2025-11-04 11:43:54', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 4, kindName: 'EXPORT TEMPORARY',  kindShortName: 'ET', createdAt: '2025-11-04 11:44:04', updatedAt: '2025-11-04 11:44:04', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 5, kindName: 'UNDER VALUE',       kindShortName: 'UV', createdAt: '2025-11-04 11:44:15', updatedAt: '2025-11-04 11:44:15', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 6, kindName: 'HAND CARRY',        kindShortName: 'HY', createdAt: '2025-11-04 11:44:21', updatedAt: '2025-11-23 18:12:23', createdBy: 1, updatedBy: 1, display: 'Y' },
  { id: 7, kindName: 'PENALTY',           kindShortName: 'PY', createdAt: '2026-03-02 09:16:38', updatedAt: '2026-03-02 09:16:38', createdBy: 1, updatedBy: 1, display: 'Y' },
];

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    for (const r of ROWS) {
      await client.query(
        `INSERT INTO kind_master_t
           (id, kind_name, kind_short_name, display, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           kind_name       = EXCLUDED.kind_name,
           kind_short_name = EXCLUDED.kind_short_name,
           display         = EXCLUDED.display,
           created_by      = EXCLUDED.created_by,
           updated_by      = EXCLUDED.updated_by,
           created_at      = EXCLUDED.created_at,
           updated_at      = EXCLUDED.updated_at`,
        [r.id, r.kindName, r.kindShortName, r.display, r.createdBy, r.updatedBy, r.createdAt, r.updatedAt],
      );
    }

    // Push the serial sequence past the highest seeded id so the next
    // auto-generated insert doesn't collide with a hand-assigned id.
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('kind_master_t', 'id'),
         (SELECT MAX(id) FROM kind_master_t)
       )`,
    );

    await client.query('COMMIT');
    console.log(`[seed] kind_master_t: upserted ${ROWS.length} rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] error:', err.message);
  process.exit(1);
});
