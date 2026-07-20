import { sql } from 'drizzle-orm';
import { applicationSettingsMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Seed the singleton settings row. Uses INSERT ... ON CONFLICT
// (id=1) DO NOTHING so re-seeding leaves operator-edited values
// alone — the whole point of the admin page is that these
// values are editable.

export async function seedApplicationSettings(
  db: Database | Transaction,
): Promise<void> {
  await db
    .insert(applicationSettingsMaster)
    .values({
      id: 1,
      projectName: 'ERP Admin',
      appTitle: 'ERP Admin',
      tagline: 'Management Console',
      primaryColor: '#2563eb',
      accentColor: '#2563eb',
      sidebarBg: '#0f172a',
      sidebarFg: '#e2e8f0',
      footerText: '© {year} ERP Admin · All rights reserved.',
    })
    .onConflictDoNothing({ target: applicationSettingsMaster.id });

  // Reset the sequence past 1 so any accidental future INSERT
  // (never expected — this is a singleton) doesn't clash on PK.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('application_settings_master_t', 'id'), 1, true)`,
  );
}
