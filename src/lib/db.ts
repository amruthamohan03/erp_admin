import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import { resolveDbCredentials } from '@/lib/dbCredentials';

declare global {
  var _pgPool: Pool | undefined;
  var _drizzleDb: NodePgDatabase<typeof schema> | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    // Shared with drizzle.config.ts and scripts/db-migrate.ts so the app, the
    // migrator and the CLI can never disagree about which database is the
    // target (PG* first, then DATABASE_URL). Not `required` here: importing
    // this module must not throw during a build with no database configured.
    ...resolveDbCredentials(),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  });

export const db: NodePgDatabase<typeof schema> =
  global._drizzleDb ??
  drizzle(pool, {
    schema,
    logger: process.env.NODE_ENV !== 'production',
  });

if (process.env.NODE_ENV !== 'production') {
  global._pgPool = pool;
  global._drizzleDb = db;
}

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export { schema };
export default db;
