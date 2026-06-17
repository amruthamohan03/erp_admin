import { sql } from 'drizzle-orm';
import { licenseTypeMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// License types per CLAUDE.md §2 step 2 — the two kinds the spec calls out.
// Add new rows here when the project supports additional license kinds; the
// upsert keeps existing data intact, so re-running is safe.

const rows = [
  {
    typeCode: 'IB',
    name: 'Import (IB)',
    description: 'Import license for goods entering DRC.',
  },
  {
    typeCode: 'Export',
    name: 'Export',
    description: 'Export license for goods leaving DRC.',
  },
];

export async function seedLicenseTypes(db: Database | Transaction): Promise<void> {
  await db
    .insert(licenseTypeMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: licenseTypeMaster.typeCode,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        updatedAt: sql`now()`,
      },
    });
}
