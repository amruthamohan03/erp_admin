// Single place that decides which Postgres the tooling and the app talk to.
//
// Resolution order: explicit PG* vars, then DATABASE_URL. Both are in
// .env.example, and before this existed they disagreed — drizzle.config.ts read
// PG* only and fell back to `database: 'postgres'`, so a .env.local carrying
// just DATABASE_URL silently ran migrations into the postgres maintenance
// database, and a stale PGDATABASE pointed at a database that doesn't exist
// (which drizzle-kit reports by printing nothing and exiting 1).
//
// `required: true` makes an unresolvable target a loud error — use it from CLI
// tooling. The app leaves it off so importing the module can't throw during a
// build that has no database configured.

export type DbCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string | undefined;
};

function fromDatabaseUrl(): Partial<DbCredentials> {
  const raw = process.env.DATABASE_URL;
  if (!raw) return {};
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${raw}`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    host: url.hostname || undefined,
    port: url.port ? Number.parseInt(url.port, 10) : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: database || undefined,
  } as Partial<DbCredentials>;
}

export function resolveDbCredentials(opts?: { required?: boolean }): DbCredentials {
  const url = fromDatabaseUrl();
  const database = process.env.PGDATABASE ?? url.database;

  if (opts?.required && !database) {
    throw new Error(
      'No target database configured. Set PGDATABASE (or DATABASE_URL) in .env.local ' +
        'to the database you created — see the README quick start.',
    );
  }

  return {
    host: process.env.PGHOST ?? url.host ?? 'localhost',
    port: process.env.PGPORT ? Number.parseInt(process.env.PGPORT, 10) : (url.port ?? 5432),
    user: process.env.PGUSER ?? url.user ?? 'postgres',
    password: process.env.PGPASSWORD ?? url.password ?? '',
    database,
  };
}
