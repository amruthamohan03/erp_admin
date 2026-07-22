import { eq, sql } from 'drizzle-orm';
import { clientMaster, importT } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sample import consignments spread across the seeded clients so
// /imports/dashboard, /clients/dashboard top-activity, and the
// list-view stat tiles show real data on first `pnpm db:seed`.
//
// Idempotent by mca_ref (partial unique index on imports_t).

interface SampleImport {
  mca_ref: string;
  client_code: string; // resolved to id at seed time
  invoice: string;
  supplier: string;
  pre_alert_date: string;
  weight: string;
  fob: string;
  m3?: string;
}

// 22 rows spread across all 10 seeded clients — clients with mining
// exposure (Glencore, Kamoa, TFM, Kibali) get more imports so the
// top-activity table shows realistic ranking.
const SAMPLES: SampleImport[] = [
  { mca_ref: 'MCA-IMP-2026-001', client_code: 'GEC001', invoice: 'INV-GLE-2601', supplier: 'Sandvik Mining', pre_alert_date: '2026-01-08', weight: '18500.00', fob: '245000.00', m3: '32.50' },
  { mca_ref: 'MCA-IMP-2026-002', client_code: 'GEC001', invoice: 'INV-GLE-2602', supplier: 'Atlas Copco', pre_alert_date: '2026-01-15', weight: '12000.00', fob: '178000.00', m3: '22.00' },
  { mca_ref: 'MCA-IMP-2026-003', client_code: 'GEC001', invoice: 'INV-GLE-2603', supplier: 'FLSmidth', pre_alert_date: '2026-02-03', weight: '9500.00', fob: '210500.00', m3: '18.75' },
  { mca_ref: 'MCA-IMP-2026-004', client_code: 'IVN002', invoice: 'INV-KAM-2601', supplier: 'Metso Outotec', pre_alert_date: '2026-01-22', weight: '24500.00', fob: '335000.00', m3: '41.00' },
  { mca_ref: 'MCA-IMP-2026-005', client_code: 'IVN002', invoice: 'INV-KAM-2602', supplier: 'Weir Minerals', pre_alert_date: '2026-02-14', weight: '17800.00', fob: '198000.00', m3: '28.50' },
  { mca_ref: 'MCA-IMP-2026-006', client_code: 'IVN002', invoice: 'INV-KAM-2603', supplier: 'Caterpillar', pre_alert_date: '2026-03-05', weight: '35200.00', fob: '512000.00', m3: '55.00' },
  { mca_ref: 'MCA-IMP-2026-007', client_code: 'TFM003', invoice: 'INV-TFM-2601', supplier: 'Volvo CE', pre_alert_date: '2026-01-30', weight: '28000.00', fob: '395000.00', m3: '45.00' },
  { mca_ref: 'MCA-IMP-2026-008', client_code: 'TFM003', invoice: 'INV-TFM-2602', supplier: 'Komatsu', pre_alert_date: '2026-02-20', weight: '31500.00', fob: '445000.00', m3: '50.00' },
  { mca_ref: 'MCA-IMP-2026-009', client_code: 'BRC004', invoice: 'INV-SMB-2601', supplier: 'Krones AG', pre_alert_date: '2026-01-12', weight: '8500.00', fob: '112000.00', m3: '15.50' },
  { mca_ref: 'MCA-IMP-2026-010', client_code: 'BRC004', invoice: 'INV-SMB-2602', supplier: 'GEA Group', pre_alert_date: '2026-02-08', weight: '6200.00', fob: '89000.00', m3: '12.00' },
  { mca_ref: 'MCA-IMP-2026-011', client_code: 'ORN005', invoice: 'INV-ORG-2601', supplier: 'Huawei', pre_alert_date: '2026-01-25', weight: '2800.00', fob: '156000.00', m3: '5.50' },
  { mca_ref: 'MCA-IMP-2026-012', client_code: 'ORN005', invoice: 'INV-ORG-2602', supplier: 'Ericsson', pre_alert_date: '2026-02-18', weight: '3200.00', fob: '198000.00', m3: '6.20' },
  { mca_ref: 'MCA-IMP-2026-013', client_code: 'AIR006', invoice: 'INV-AFR-2601', supplier: 'ZTE Corporation', pre_alert_date: '2026-01-28', weight: '2100.00', fob: '98000.00', m3: '4.50' },
  { mca_ref: 'MCA-IMP-2026-014', client_code: 'PWR007', invoice: 'INV-KIB-2601', supplier: 'Barrick Supplier Co.', pre_alert_date: '2026-01-18', weight: '22000.00', fob: '285000.00', m3: '35.00' },
  { mca_ref: 'MCA-IMP-2026-015', client_code: 'PWR007', invoice: 'INV-KIB-2602', supplier: 'Wärtsilä', pre_alert_date: '2026-02-25', weight: '19500.00', fob: '267000.00', m3: '30.50' },
  { mca_ref: 'MCA-IMP-2026-016', client_code: 'PWR007', invoice: 'INV-KIB-2603', supplier: 'Metso Outotec', pre_alert_date: '2026-03-10', weight: '27000.00', fob: '378000.00', m3: '42.00' },
  { mca_ref: 'MCA-IMP-2026-017', client_code: 'CIM008', invoice: 'INV-CIM-2601', supplier: 'FLSmidth', pre_alert_date: '2026-02-01', weight: '45000.00', fob: '520000.00', m3: '68.00' },
  { mca_ref: 'MCA-IMP-2026-018', client_code: 'CIM008', invoice: 'INV-CIM-2602', supplier: 'thyssenkrupp', pre_alert_date: '2026-03-15', weight: '38000.00', fob: '445000.00', m3: '58.00' },
  { mca_ref: 'MCA-IMP-2026-019', client_code: 'MAR009', invoice: 'INV-MAR-2601', supplier: 'Bühler', pre_alert_date: '2026-01-20', weight: '5800.00', fob: '78000.00', m3: '10.50' },
  { mca_ref: 'MCA-IMP-2026-020', client_code: 'MAR009', invoice: 'INV-MAR-2602', supplier: 'SIG Combibloc', pre_alert_date: '2026-02-12', weight: '4200.00', fob: '65000.00', m3: '8.20' },
  { mca_ref: 'MCA-IMP-2026-021', client_code: 'BEL010', invoice: 'INV-BRA-2601', supplier: 'Krones AG', pre_alert_date: '2026-01-14', weight: '11500.00', fob: '145000.00', m3: '18.00' },
  { mca_ref: 'MCA-IMP-2026-022', client_code: 'BEL010', invoice: 'INV-BRA-2602', supplier: 'KHS Group', pre_alert_date: '2026-02-28', weight: '9800.00', fob: '128000.00', m3: '15.50' },
];

export async function seedSampleImports(
  db: Database | Transaction,
): Promise<void> {
  // Resolve client_code → id once upfront so we're not doing 22 lookups.
  const clientRows = await db
    .select({ id: clientMaster.id, code: clientMaster.shortName })
    .from(clientMaster);
  const codeToId = new Map(clientRows.map((r) => [r.code, r.id]));

  for (const s of SAMPLES) {
    const clientId = codeToId.get(s.client_code);
    if (!clientId) continue; // client hasn't been seeded — skip silently

    const [existing] = await db
      .select({ id: importT.id })
      .from(importT)
      .where(eq(importT.mcaRef, s.mca_ref))
      .limit(1);

    if (existing) {
      await db
        .update(importT)
        .set({
          clientId,
          invoice: s.invoice,
          supplier: s.supplier,
          preAlertDate: s.pre_alert_date,
          weight: s.weight,
          fob: s.fob,
          m3: s.m3 ?? null,
          updatedAt: sql`now()`,
        })
        .where(eq(importT.id, existing.id));
    } else {
      await db.insert(importT).values({
        mcaRef: s.mca_ref,
        clientId,
        invoice: s.invoice,
        supplier: s.supplier,
        preAlertDate: s.pre_alert_date,
        weight: s.weight,
        fob: s.fob,
        m3: s.m3 ?? null,
      });
    }
  }
}
