import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT } from '@/db/schema';
import type { ReportHandler } from '../types';

// Licenses grouped by lifecycle state. No parameters.
//
// Output columns (matches report_definition_master_t.columns_json for
// report_key = 'licenses-by-state'):
//   state (text), count (number)

export const handler: ReportHandler = async () => {
  const rows = await db
    .select({
      state: licenseT.state,
      count: sql<number>`count(*)::int`,
    })
    .from(licenseT)
    .where(sql`${licenseT.display} = 'Y'`)
    .groupBy(licenseT.state)
    .orderBy(licenseT.state);

  return rows.map((r) => ({ state: r.state, count: r.count }));
};
