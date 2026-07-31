import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';
import { resolveDbCredentials } from './src/lib/dbCredentials';

loadEnv({ path: '.env.local' });
loadEnv();

const { host, port, user, password, database } = resolveDbCredentials({ required: true });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // `database` is non-null here — resolveDbCredentials throws when required.
  dbCredentials: { host, port, user, password, database: database as string, ssl: false },
  strict: true,
  verbose: true,
});
