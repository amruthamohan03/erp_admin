import { sql } from 'drizzle-orm';
import { mcaRefFormatMaster } from '@/db/schema';
import { MCA_REF_DEFAULTS, MCA_REF_TARGETS, MCA_REF_TARGET_KEYS } from '@/lib/mcaRefFormat';
import type { Database, Transaction } from '@/lib/db';

// §4.1 — the six reference-number formats, seeded to exactly what the hardcoded
// resolvers used to produce (see src/lib/mcaRefFormat.ts). Migration 0060 does
// the same for an existing database; this is the fresh-install path, and the two
// must agree — a database built from migrations and one built from the seed have
// to name consignments identically.
//
// `onConflictDoNothing`, not `onConflictDoUpdate`: unlike a lookup table, this
// row IS the operator's decision. Re-running the seed must not quietly put
// `NMI-IDCOR26-0001` back after someone changed it to `IDCOR26-0001-NMI`.

export async function seedMcaRefFormats(db: Database | Transaction): Promise<void> {
  for (const key of MCA_REF_TARGET_KEYS) {
    const meta = MCA_REF_TARGETS[key];
    await db
      .insert(mcaRefFormatMaster)
      .values({
        targetKey: key,
        formatName: `${meta.label} — ${meta.fieldLabel}`,
        segments: MCA_REF_DEFAULTS[key],
        display: 'Y',
        createdAt: sql`now()` as unknown as Date,
      })
      .onConflictDoNothing({ target: mcaRefFormatMaster.targetKey });
  }
}
