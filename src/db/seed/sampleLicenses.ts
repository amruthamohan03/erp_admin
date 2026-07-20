import { eq, sql } from 'drizzle-orm';
import {
  clientMaster,
  licenseT,
  licenseTypeMaster,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sample licenses spread across the workflow states so
// /licenses/dashboard shows non-zero buckets on first pnpm db:seed.
//
// The seeded workflow is: draft → submitted → approved → issued
// (happy path) plus `cancelled` as an escape hatch. Direct inserts
// with specific state values bypass the case-runtime — that's
// intentional for seed data (workflow gates transitions, not
// creation-with-state).
//
// Sample distribution:
//   * 4 issued (of which 2 expiring within 30 days for the "expiring
//     soon" bucket)
//   * 2 approved (waiting for issuance)
//   * 3 pending (2 draft, 1 submitted)
//   * 1 cancelled
//
// Idempotent by license_no (unique).

interface SampleLicense {
  license_no: string;
  client_code: string;
  type_code: 'IB' | 'Export';
  state: 'draft' | 'submitted' | 'approved' | 'issued' | 'cancelled';
  amount: string;
  currency: 'USD' | 'CDF';
  issue_date: string | null;
  expiry_date: string | null;
  approved_at: string | null;
  notes: string;
}

// Dates written as YYYY-MM-DD strings.
// `expiring soon` samples use expiry within 30 days of a typical
// seeding run — since Date.now is unavailable in the seed we bake
// concrete dates. Operators regenerating the seed can bump these.
const SAMPLES: SampleLicense[] = [
  // ── Issued (4) ─────────────────────────────────────────────────
  {
    license_no: 'LIC-IB-2026-001',
    client_code: 'GEC001',
    type_code: 'IB',
    state: 'issued',
    amount: '250000.00',
    currency: 'USD',
    issue_date: '2026-01-15',
    expiry_date: '2027-01-14',
    approved_at: '2026-01-12 09:30:00',
    notes: 'Annual mining equipment import license',
  },
  {
    license_no: 'LIC-IB-2026-002',
    client_code: 'IVN002',
    type_code: 'IB',
    state: 'issued',
    amount: '450000.00',
    currency: 'USD',
    issue_date: '2026-02-01',
    expiry_date: '2027-01-31',
    approved_at: '2026-01-28 14:15:00',
    notes: 'Kamoa Copper — multi-shipment umbrella license',
  },
  // Two "expiring soon" licenses — expiry within 30 days of a
  // typical seeding date so the expiring-soon card lights up.
  {
    license_no: 'LIC-IB-2025-091',
    client_code: 'TFM003',
    type_code: 'IB',
    state: 'issued',
    amount: '385000.00',
    currency: 'USD',
    issue_date: '2025-08-01',
    expiry_date: '2026-08-15',
    approved_at: '2025-07-28 10:00:00',
    notes: 'Renewal due — expiry within window',
  },
  {
    license_no: 'LIC-EXP-2025-045',
    client_code: 'PWR007',
    type_code: 'Export',
    state: 'issued',
    amount: '5200000.00',
    currency: 'USD',
    issue_date: '2025-09-10',
    expiry_date: '2026-08-05',
    approved_at: '2025-09-05 16:20:00',
    notes: 'Kibali gold export — quarterly renewal',
  },
  // ── Approved (2) ───────────────────────────────────────────────
  {
    license_no: 'LIC-IB-2026-003',
    client_code: 'BRC004',
    type_code: 'IB',
    state: 'approved',
    amount: '95000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: '2026-03-10 11:00:00',
    notes: 'Simba brewery equipment — awaiting issuance',
  },
  {
    license_no: 'LIC-EXP-2026-004',
    client_code: 'CIM008',
    type_code: 'Export',
    state: 'approved',
    amount: '620000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: '2026-03-15 13:45:00',
    notes: 'Cement export to Zambia',
  },
  // ── Pending (3: 2 draft + 1 submitted) ─────────────────────────
  {
    license_no: 'LIC-IB-2026-005',
    client_code: 'ORN005',
    type_code: 'IB',
    state: 'draft',
    amount: '165000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: null,
    notes: 'Telecom infrastructure — draft, awaiting supplier docs',
  },
  {
    license_no: 'LIC-IB-2026-006',
    client_code: 'AIR006',
    type_code: 'IB',
    state: 'draft',
    amount: '98000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: null,
    notes: 'Africell network gear — draft',
  },
  {
    license_no: 'LIC-EXP-2026-007',
    client_code: 'IVN002',
    type_code: 'Export',
    state: 'submitted',
    amount: '1520000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: null,
    notes: 'Kamoa copper Q2 export batch — under review',
  },
  // ── Cancelled (1) ──────────────────────────────────────────────
  {
    license_no: 'LIC-IB-2026-008',
    client_code: 'MAR009',
    type_code: 'IB',
    state: 'cancelled',
    amount: '78000.00',
    currency: 'USD',
    issue_date: null,
    expiry_date: null,
    approved_at: null,
    notes: 'Cancelled — supplier substitution required new filing',
  },
];

export async function seedSampleLicenses(
  db: Database | Transaction,
): Promise<void> {
  const clientRows = await db
    .select({ id: clientMaster.id, code: clientMaster.clientCode })
    .from(clientMaster);
  const codeToClientId = new Map(clientRows.map((r) => [r.code, r.id]));

  const typeRows = await db
    .select({ id: licenseTypeMaster.id, code: licenseTypeMaster.typeCode })
    .from(licenseTypeMaster);
  const codeToTypeId = new Map(typeRows.map((r) => [r.code, r.id]));

  for (const s of SAMPLES) {
    const clientId = codeToClientId.get(s.client_code);
    const typeId = codeToTypeId.get(s.type_code);
    if (!clientId || !typeId) continue;

    const [existing] = await db
      .select({ id: licenseT.id })
      .from(licenseT)
      .where(eq(licenseT.licenseNo, s.license_no))
      .limit(1);

    const values = {
      clientId,
      licenseTypeId: typeId,
      state: s.state,
      amount: s.amount,
      currency: s.currency,
      issueDate: s.issue_date,
      expiryDate: s.expiry_date,
      approvedAt: s.approved_at ? new Date(s.approved_at) : null,
      notes: s.notes,
    };

    if (existing) {
      await db
        .update(licenseT)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(licenseT.id, existing.id));
    } else {
      await db.insert(licenseT).values({
        licenseNo: s.license_no,
        ...values,
      });
    }
  }
}
