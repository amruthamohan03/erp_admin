// Seed/reset the admin user with a freshly generated bcrypt hash.
// Run with:  npm run seed
//
// This avoids the "embedded hash doesn't verify" problem by generating
// the hash on YOUR machine using YOUR installed bcryptjs version.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

// Tiny .env.local parser - no dotenv dependency needed.
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

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_FULL_NAME = 'System Administrator';
const ADMIN_ROLE_ID = 1; // Super Admin

async function main() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  console.log('[seed] generated bcrypt hash');

  const client = new Client({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();

  const exists = await client.query(
    `SELECT id FROM users_t WHERE username = $1`,
    [ADMIN_USERNAME],
  );

  if (exists.rowCount > 0) {
    await client.query(
      `UPDATE users_t SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`,
      [hash, ADMIN_USERNAME],
    );
    console.log(`[seed] admin password reset for user id=${exists.rows[0].id}`);
  } else {
    const result = await client.query(
      `INSERT INTO users_t
         (username, password, email, mobile, full_name, role_id, display, profile_image)
       VALUES ($1, $2, $3, $4, $5, $6, 'Y', 'default.jpg')
       RETURNING id`,
      [ADMIN_USERNAME, hash, ADMIN_EMAIL, '9999999999', ADMIN_FULL_NAME, ADMIN_ROLE_ID],
    );
    console.log(`[seed] admin user created with id=${result.rows[0].id}`);
  }

  await client.end();
  console.log('');
  console.log('Login credentials:');
  console.log(`  username: ${ADMIN_USERNAME}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
}

main().catch((err) => {
  console.error('[seed] error:', err.message);
  process.exit(1);
});
