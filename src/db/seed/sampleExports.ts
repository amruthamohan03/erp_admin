import { eq, sql } from 'drizzle-orm';
import { clientMaster, exportT } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sample export consignments — DRC exports are predominantly mining
// concentrates so mining clients (Glencore, Kamoa, TFM, Kibali)
// carry most of the volume. Destinations reflect real DRC export
// corridors: Durban (via Zambia + Zimbabwe), Dar es Salaam
// (Tanzania), Mombasa (Kenya via Uganda), Lobito (Angola/Benguela
// corridor).
//
// Idempotent by mca_ref (partial unique index on exports_t).

interface SampleExport {
  mca_ref: string;
  client_code: string;
  invoice: string;
  buyer: string;
  destination: string;
  loading_date: string;
  weight: string;
  fob: string;
  number_of_bags?: number;
  lot_number?: string;
}

const SAMPLES: SampleExport[] = [
  { mca_ref: 'MCA-EXP-2026-001', client_code: 'GEC001', invoice: 'EXP-GLE-2601', buyer: 'Glencore Marketing Ltd', destination: 'Durban, South Africa', loading_date: '2026-01-10', weight: '128500.500', fob: '875000.00', number_of_bags: 5140, lot_number: 'LOT-Cu-2601' },
  { mca_ref: 'MCA-EXP-2026-002', client_code: 'GEC001', invoice: 'EXP-GLE-2602', buyer: 'Glencore Marketing Ltd', destination: 'Dar es Salaam, Tanzania', loading_date: '2026-01-24', weight: '145000.000', fob: '985000.00', number_of_bags: 5800, lot_number: 'LOT-Cu-2602' },
  { mca_ref: 'MCA-EXP-2026-003', client_code: 'GEC001', invoice: 'EXP-GLE-2603', buyer: 'Trafigura Beheer BV', destination: 'Durban, South Africa', loading_date: '2026-02-11', weight: '132000.750', fob: '912000.00', number_of_bags: 5280, lot_number: 'LOT-Co-2603' },
  { mca_ref: 'MCA-EXP-2026-004', client_code: 'IVN002', invoice: 'EXP-KAM-2601', buyer: 'CITIC Metal Africa', destination: 'Lobito, Angola', loading_date: '2026-01-18', weight: '215000.000', fob: '1450000.00', number_of_bags: 8600, lot_number: 'LOT-Cu-KAM-2601' },
  { mca_ref: 'MCA-EXP-2026-005', client_code: 'IVN002', invoice: 'EXP-KAM-2602', buyer: 'Zijin Mining Group', destination: 'Dar es Salaam, Tanzania', loading_date: '2026-02-05', weight: '198500.250', fob: '1385000.00', number_of_bags: 7940, lot_number: 'LOT-Cu-KAM-2602' },
  { mca_ref: 'MCA-EXP-2026-006', client_code: 'IVN002', invoice: 'EXP-KAM-2603', buyer: 'Trafigura Beheer BV', destination: 'Lobito, Angola', loading_date: '2026-02-28', weight: '223000.000', fob: '1520000.00', number_of_bags: 8920, lot_number: 'LOT-Cu-KAM-2603' },
  { mca_ref: 'MCA-EXP-2026-007', client_code: 'IVN002', invoice: 'EXP-KAM-2604', buyer: 'CMOC International', destination: 'Durban, South Africa', loading_date: '2026-03-12', weight: '187500.000', fob: '1275000.00', number_of_bags: 7500, lot_number: 'LOT-Co-KAM-2604' },
  { mca_ref: 'MCA-EXP-2026-008', client_code: 'TFM003', invoice: 'EXP-TFM-2601', buyer: 'CMOC International', destination: 'Dar es Salaam, Tanzania', loading_date: '2026-01-27', weight: '178000.500', fob: '1215000.00', number_of_bags: 7120, lot_number: 'LOT-Co-TFM-2601' },
  { mca_ref: 'MCA-EXP-2026-009', client_code: 'TFM003', invoice: 'EXP-TFM-2602', buyer: 'Umicore', destination: 'Durban, South Africa', loading_date: '2026-02-18', weight: '165000.750', fob: '1145000.00', number_of_bags: 6600, lot_number: 'LOT-Co-TFM-2602' },
  { mca_ref: 'MCA-EXP-2026-010', client_code: 'TFM003', invoice: 'EXP-TFM-2603', buyer: 'CMOC International', destination: 'Mombasa, Kenya', loading_date: '2026-03-08', weight: '192500.000', fob: '1325000.00', number_of_bags: 7700, lot_number: 'LOT-Cu-TFM-2603' },
  { mca_ref: 'MCA-EXP-2026-011', client_code: 'PWR007', invoice: 'EXP-KIB-2601', buyer: 'Metalor Technologies', destination: 'Zurich (air), Switzerland', loading_date: '2026-01-15', weight: '850.500', fob: '4250000.00', number_of_bags: 34, lot_number: 'LOT-Au-KIB-2601' },
  { mca_ref: 'MCA-EXP-2026-012', client_code: 'PWR007', invoice: 'EXP-KIB-2602', buyer: 'Perth Mint', destination: 'Johannesburg (air), South Africa', loading_date: '2026-02-08', weight: '920.750', fob: '4685000.00', number_of_bags: 37, lot_number: 'LOT-Au-KIB-2602' },
  { mca_ref: 'MCA-EXP-2026-013', client_code: 'PWR007', invoice: 'EXP-KIB-2603', buyer: 'Metalor Technologies', destination: 'Zurich (air), Switzerland', loading_date: '2026-03-04', weight: '785.000', fob: '3985000.00', number_of_bags: 31, lot_number: 'LOT-Au-KIB-2603' },
  { mca_ref: 'MCA-EXP-2026-014', client_code: 'CIM008', invoice: 'EXP-CIM-2601', buyer: 'Zambian Cement Ltd', destination: 'Ndola, Zambia', loading_date: '2026-02-15', weight: '450000.000', fob: '325000.00', number_of_bags: 9000, lot_number: 'LOT-Cem-2601' },
  { mca_ref: 'MCA-EXP-2026-015', client_code: 'CIM008', invoice: 'EXP-CIM-2602', buyer: 'Lafarge Africa', destination: 'Ndola, Zambia', loading_date: '2026-03-01', weight: '425000.500', fob: '312000.00', number_of_bags: 8500, lot_number: 'LOT-Cem-2602' },
];

export async function seedSampleExports(
  db: Database | Transaction,
): Promise<void> {
  const clientRows = await db
    .select({ id: clientMaster.id, code: clientMaster.shortName })
    .from(clientMaster);
  const codeToId = new Map(clientRows.map((r) => [r.code, r.id]));

  for (const s of SAMPLES) {
    const clientId = codeToId.get(s.client_code);
    if (!clientId) continue;

    const [existing] = await db
      .select({ id: exportT.id })
      .from(exportT)
      .where(eq(exportT.mcaRef, s.mca_ref))
      .limit(1);

    if (existing) {
      await db
        .update(exportT)
        .set({
          clientId,
          invoice: s.invoice,
          buyer: s.buyer,
          destination: s.destination,
          loadingDate: s.loading_date,
          weight: s.weight,
          fob: s.fob,
          numberOfBags: s.number_of_bags ?? null,
          lotNumber: s.lot_number ?? null,
          updatedAt: sql`now()`,
        })
        .where(eq(exportT.id, existing.id));
    } else {
      await db.insert(exportT).values({
        mcaRef: s.mca_ref,
        clientId,
        invoice: s.invoice,
        buyer: s.buyer,
        destination: s.destination,
        loadingDate: s.loading_date,
        weight: s.weight,
        fob: s.fob,
        numberOfBags: s.number_of_bags ?? null,
        lotNumber: s.lot_number ?? null,
      });
    }
  }
}
