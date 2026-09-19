import { db, pool } from '@/lib/db';
import { seedSampleClients } from '@/db/seed/sampleClients';
import { seedSampleLicenses } from '@/db/seed/sampleLicenses';
import { seedSampleImports } from '@/db/seed/sampleImports';
import { seedSampleExports } from '@/db/seed/sampleExports';
import { clientMaster, licenseT, importT, exportT } from '@/db/schema';

// Runs ONLY the demo-data seeds (clients → licences → import/export
// tracking), in dependency order. `pnpm db:seed` runs these too, but it
// also replays every master + page-config seed; this entry point exists so
// sample data can be topped up without touching master_page_t config that
// a migration has since altered.
//
// Idempotent, same as the seeds themselves: clients upsert by short_name,
// licences by license_number, consignments by mca_ref.
//
// Order matters — all three consignment/licence seeds resolve their client
// by short_name, so the clients have to exist first.
async function main(): Promise<void> {
  await db.transaction(async (tx) => {
    await seedSampleClients(tx);
    await seedSampleLicenses(tx);
    await seedSampleImports(tx);
    await seedSampleExports(tx);
  });

  const counts = await Promise.all([
    db.select({ id: clientMaster.id }).from(clientMaster),
    db.select({ id: licenseT.id }).from(licenseT),
    db.select({ id: importT.id }).from(importT),
    db.select({ id: exportT.id }).from(exportT),
  ]);
  const [clients, licenses, imports, exports] = counts.map((r) => r.length);
  console.log(
    `✓ sample data seeded — ${clients} clients, ${licenses} licences, ${imports} imports, ${exports} exports`,
  );
}

main()
  .catch((err) => {
    console.error('reseed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
