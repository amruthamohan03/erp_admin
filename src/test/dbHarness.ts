import { Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@/db/schema';

// Test DB harness — hybrid auto-detect per CLAUDE.md design call.
//
// Resolution order:
//   1. process.env.TEST_DATABASE_URL — explicit opt-in. Useful in CI when
//      a real Postgres is already provisioned, or in dev when Docker isn't
//      available. The DB is assumed to be empty; migrations + seeds run
//      against it during global setup.
//   2. Testcontainers (Docker) — fully self-contained. Spins up a fresh
//      postgres:16 container at start-up, applies migrations, runs seeds,
//      tears down on exit. ~5-10s startup; no cross-run state leakage.
//
// Tests should never `import { db } from '@/lib/db'` directly — the harness
// owns the connection and exposes it through getTestDb() so test isolation
// (TRUNCATE-between-tests, transaction-rollback, …) routes through one
// known place.

export interface TestDbHandle {
  url: string;
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  /** Run on process teardown. Idempotent. */
  cleanup: () => Promise<void>;
}

let active: TestDbHandle | null = null;

/**
 * Returns the active handle. Throws if called before startTestDb() — guards
 * tests against a misconfigured globalSetup that didn't run.
 */
export function getTestDb(): TestDbHandle {
  if (!active) {
    throw new Error(
      'Test DB harness not initialized. Did vitest globalSetup run? ' +
        'See src/test/globalSetup.ts.',
    );
  }
  return active;
}

async function dbFromUrl(url: string): Promise<{ pool: Pool; db: NodePgDatabase<typeof schema> }> {
  const config: PoolConfig = { connectionString: url, max: 5 };
  const pool = new Pool(config);
  const db = drizzle(pool, { schema });
  return { pool, db };
}

async function tryTestDatabaseUrl(): Promise<TestDbHandle | null> {
  if (!process.env.TEST_DATABASE_URL) return null;
  const { pool, db } = await dbFromUrl(process.env.TEST_DATABASE_URL);
  return {
    url: process.env.TEST_DATABASE_URL,
    pool,
    db,
    cleanup: async () => {
      await pool.end();
    },
  };
}

async function tryTestcontainer(): Promise<TestDbHandle> {
  let containerModule: typeof import('@testcontainers/postgresql');
  try {
    containerModule = await import('@testcontainers/postgresql');
  } catch (err) {
    throw new Error(
      'Testcontainers not available. Either install Docker so Testcontainers ' +
        'can spin up a postgres container, or set TEST_DATABASE_URL to point ' +
        `at an existing test DB. Last error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const container = await new containerModule.PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const { pool, db } = await dbFromUrl(url);
  return {
    url,
    pool,
    db,
    cleanup: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

/**
 * Resolve a test DB, apply every committed migration, and seed every
 * master row via seedMasters. Called once from vitest globalSetup;
 * teardown calls cleanup().
 *
 * The seeded admin user (scripts/seed-admin.js) isn't inserted by default —
 * tests that need a user row should create one explicitly so the assertion
 * matches what the test cares about.
 */
export async function startTestDb(): Promise<TestDbHandle> {
  if (active) return active;
  active = (await tryTestDatabaseUrl()) ?? (await tryTestcontainer());

  // Apply migrations from drizzle/ (same set npm run db:migrate would run).
  await migrate(active.db, { migrationsFolder: 'drizzle' });

  // Run master seeds so integration tests have realistic case templates to
  // work against (license_default, invoice_default, payment_request_default).
  const { seedMasters } = await import('@/db/seed');
  await seedMasters(active.db);

  return active;
}

export async function stopTestDb(): Promise<void> {
  if (!active) return;
  await active.cleanup();
  active = null;
}
