import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _drizzleDb: NodePgDatabase<typeof schema> | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
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
