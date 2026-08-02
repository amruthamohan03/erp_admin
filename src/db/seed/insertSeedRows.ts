import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '@/lib/db';

// Shared writer for the bulk reference-data seeds (§4.1 masters, §4.12 page
// config). Those payloads live as JSON captures under ./data rather than as
// hand-written value arrays — a few hundred rows per table would otherwise be
// unreviewable — so the insert has to be built dynamically. Per §7.3 that means
// the `sql` template tag with sql.identifier for the table/column names and
// bound parameters for every value; nothing is concatenated into the SQL text.
//
// Rows carry their original ids. That is deliberate: master_page config,
// bulk-filter predicates, derive/conditions rules and sample data all reference
// masters by id (kind_id 5/6/7 = the MCA kinds, transport_mode 1 = ROAD, …), so
// a renumbered seed would silently break the forms. The serial sequence is
// pushed past the seeded max afterwards, same as seedBootstrapRole does.

export type SeedTable = {
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<ReadonlyArray<string | null>>;
};

export async function insertSeedRows(
  db: Database | Transaction,
  table: string,
  data: SeedTable | undefined,
): Promise<void> {
  if (!data || data.rows.length === 0) return;

  const columns = sql.join(
    data.columns.map((c) => sql.identifier(c)),
    sql`, `,
  );
  const values = sql.join(
    data.rows.map(
      (row) =>
        sql`(${sql.join(
          row.map((v) => sql`${v}`),
          sql`, `,
        )})`,
    ),
    sql`, `,
  );

  // Values arrive as the dump's text form ('1', 't', an ISO date, a JSON
  // document). Postgres resolves each bound parameter against the target
  // column's type, so no per-column coercion is needed here.
  await db.execute(
    sql`INSERT INTO ${sql.identifier(table)} (${columns}) VALUES ${values} ON CONFLICT (id) DO NOTHING`,
  );

  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), GREATEST((SELECT max(id) FROM ${sql.identifier(table)}), 1))`,
  );
}
