// Seed banklist_master_t with the canonical bank list using Drizzle.
// Run with:  pnpm tsx scripts/seed-banklist-master.ts
//
// Upserts by id so re-running is idempotent, then bumps the serial
// sequence past the highest seeded id so future inserts don't collide.

import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';

function loadEnv(file: string): void {
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

// Timestamps are kept as raw strings so Postgres stores the literal wall-clock
// value. Passing JS Date objects would let pg-node apply the local timezone
// offset and corrupt the stored time.
type BankRow = {
  id: number;
  bankName: string;
  bankCode: string;
  forExchange: 'Y' | 'N';
  display: 'Y' | 'N';
  createdBy: number;
  updatedBy: number;
  createdAt: string;
  updatedAt: string;
};

const ROWS: BankRow[] = [
  { id: 1,  bankName: 'ACCESS BANK',    bankCode: 'N/A', forExchange: 'Y', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:47:47', updatedAt: '2025-12-02 03:28:35' },
  { id: 2,  bankName: 'EQUITY BCDC',    bankCode: 'N/A', forExchange: 'Y', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:47:58', updatedAt: '2025-12-02 03:28:41' },
  { id: 3,  bankName: 'BIAC',           bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:48:10', updatedAt: '2025-10-29 14:48:10' },
  { id: 4,  bankName: 'CITI BANK',      bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:48:17', updatedAt: '2025-10-29 14:48:17' },
  { id: 5,  bankName: 'ECO BANK',       bankCode: 'N/A', forExchange: 'Y', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:48:36', updatedAt: '2025-12-02 03:28:48' },
  { id: 6,  bankName: 'FBN BANK',       bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:48:50', updatedAt: '2025-10-29 14:48:50' },
  { id: 7,  bankName: 'RAW BANK',       bankCode: 'N/A', forExchange: 'Y', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:48:56', updatedAt: '2025-12-02 03:28:55' },
  { id: 8,  bankName: 'SOFI BANK',      bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:49:10', updatedAt: '2025-10-29 14:49:10' },
  { id: 9,  bankName: 'STANDARD BANK',  bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:49:27', updatedAt: '2025-10-29 14:49:27' },
  { id: 10, bankName: 'TMB',            bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-10-29 14:49:40', updatedAt: '2025-10-29 14:49:40' },
  { id: 11, bankName: 'BGFI BANK',      bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2025-12-10 14:16:46', updatedAt: '2025-12-10 14:16:46' },
  { id: 12, bankName: 'BANK OF AFRICA', bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2026-01-11 12:38:22', updatedAt: '2026-01-11 12:38:22' },
  { id: 13, bankName: 'CRDB Bank',      bankCode: 'N/A', forExchange: 'N', display: 'Y', createdBy: 1, updatedBy: 1, createdAt: '2026-01-27 12:49:28', updatedAt: '2026-01-27 12:49:28' },
];

async function main(): Promise<void> {
  // Import db only after env is loaded — the pool reads env at module init.
  const { db, pool } = await import('@/lib/db');

  await db.transaction(async (tx) => {
    const valueTuples = ROWS.map(
      (r) =>
        sql`(${r.id}, ${r.bankName}, ${r.bankCode}, ${r.forExchange}, ${r.display}, ${r.createdBy}, ${r.updatedBy}, ${r.createdAt}::timestamp, ${r.updatedAt}::timestamp)`,
    );

    await tx.execute(sql`
      INSERT INTO banklist_master_t
        (id, bank_name, bank_code, for_exchange, display, created_by, updated_by, created_at, updated_at)
      VALUES ${sql.join(valueTuples, sql`, `)}
      ON CONFLICT (id) DO UPDATE SET
        bank_name    = excluded.bank_name,
        bank_code    = excluded.bank_code,
        for_exchange = excluded.for_exchange,
        display      = excluded.display,
        created_by   = excluded.created_by,
        updated_by   = excluded.updated_by,
        created_at   = excluded.created_at,
        updated_at   = excluded.updated_at
    `);

    // Push the serial sequence past the highest seeded id so the next
    // auto-generated insert doesn't collide with a hand-assigned id.
    await tx.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('banklist_master_t', 'id'),
        (SELECT MAX(id) FROM banklist_master_t)
      )
    `);
  });

  console.log(`[seed] banklist_master_t: upserted ${ROWS.length} rows`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
