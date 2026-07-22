import { eq, sql } from 'drizzle-orm';
import { clientMaster, quotations } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sample quotations — header rows only, no line items. The
// /quotations/dashboard cards read total_count, total_usd,
// total_cdf, this_month_count from the header, so header data is
// enough to light the dashboard up.
//
// Line-item seeding would go through buildQuotation() to compute
// the sub/vat/arsp splits — that's genuine per-line math coupling
// and out of scope for a "get the dashboard populated" seed. Real
// quotations get created via /quotations/new which runs the
// compute path server-side.
//
// Idempotent by quotation_ref (unique).

interface SampleQuotation {
  quotation_ref: string;
  client_code: string;
  quotation_date: string;
  sub_total: string;
  vat_amount: string; // typically 16% of sub_total (DRC VAT rate)
  total_amount: string; // sub_total + vat + arsp
  arsp: 'Enabled' | 'Disabled';
  arsp_amount: string;
  // CDF equivalents populated for the Import Definitive path
  // (some quotations only quote USD).
  sub_total_cdf?: string;
  vat_amount_cdf?: string;
  total_amount_cdf?: string;
}

// Ten quotations spread across the seeded clients. Mix of
// USD-only (typical exports) and USD+CDF (import definitive with
// customs charges).
const SAMPLES: SampleQuotation[] = [
  {
    quotation_ref: 'QUO-2026-001',
    client_code: 'GEC001',
    quotation_date: '2026-01-05',
    sub_total: '12500.00',
    vat_amount: '2000.00',
    arsp: 'Enabled',
    arsp_amount: '150.00',
    total_amount: '14650.00',
    sub_total_cdf: '34375000.00',
    vat_amount_cdf: '5500000.00',
    total_amount_cdf: '40287500.00',
  },
  {
    quotation_ref: 'QUO-2026-002',
    client_code: 'IVN002',
    quotation_date: '2026-01-18',
    sub_total: '28900.00',
    vat_amount: '4624.00',
    arsp: 'Enabled',
    arsp_amount: '346.80',
    total_amount: '33870.80',
    sub_total_cdf: '79475000.00',
    vat_amount_cdf: '12716000.00',
    total_amount_cdf: '93144900.00',
  },
  {
    quotation_ref: 'QUO-2026-003',
    client_code: 'TFM003',
    quotation_date: '2026-02-03',
    sub_total: '18750.00',
    vat_amount: '3000.00',
    arsp: 'Disabled',
    arsp_amount: '0.00',
    total_amount: '21750.00',
    sub_total_cdf: '51562500.00',
    vat_amount_cdf: '8250000.00',
    total_amount_cdf: '59812500.00',
  },
  {
    quotation_ref: 'QUO-2026-004',
    client_code: 'BRC004',
    quotation_date: '2026-02-11',
    sub_total: '4850.00',
    vat_amount: '776.00',
    arsp: 'Enabled',
    arsp_amount: '58.20',
    total_amount: '5684.20',
  },
  {
    quotation_ref: 'QUO-2026-005',
    client_code: 'ORN005',
    quotation_date: '2026-02-19',
    sub_total: '7200.00',
    vat_amount: '1152.00',
    arsp: 'Enabled',
    arsp_amount: '86.40',
    total_amount: '8438.40',
  },
  {
    quotation_ref: 'QUO-2026-006',
    client_code: 'PWR007',
    quotation_date: '2026-02-27',
    sub_total: '3200.00',
    vat_amount: '512.00',
    arsp: 'Enabled',
    arsp_amount: '38.40',
    total_amount: '3750.40',
  },
  {
    quotation_ref: 'QUO-2026-007',
    client_code: 'CIM008',
    quotation_date: '2026-03-04',
    sub_total: '15600.00',
    vat_amount: '2496.00',
    arsp: 'Disabled',
    arsp_amount: '0.00',
    total_amount: '18096.00',
    sub_total_cdf: '42900000.00',
    vat_amount_cdf: '6864000.00',
    total_amount_cdf: '49764000.00',
  },
  {
    quotation_ref: 'QUO-2026-008',
    client_code: 'IVN002',
    quotation_date: '2026-03-12',
    sub_total: '32450.00',
    vat_amount: '5192.00',
    arsp: 'Enabled',
    arsp_amount: '389.40',
    total_amount: '38031.40',
    sub_total_cdf: '89237500.00',
    vat_amount_cdf: '14278000.00',
    total_amount_cdf: '104586300.00',
  },
  {
    quotation_ref: 'QUO-2026-009',
    client_code: 'MAR009',
    quotation_date: '2026-03-18',
    sub_total: '2850.00',
    vat_amount: '456.00',
    arsp: 'Enabled',
    arsp_amount: '34.20',
    total_amount: '3340.20',
  },
  {
    quotation_ref: 'QUO-2026-010',
    client_code: 'BEL010',
    quotation_date: '2026-03-25',
    sub_total: '5900.00',
    vat_amount: '944.00',
    arsp: 'Enabled',
    arsp_amount: '70.80',
    total_amount: '6914.80',
  },
];

export async function seedSampleQuotations(
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
      .select({ id: quotations.id })
      .from(quotations)
      .where(eq(quotations.quotationRef, s.quotation_ref))
      .limit(1);

    const values = {
      clientId,
      quotationDate: s.quotation_date,
      subTotal: s.sub_total,
      vatAmount: s.vat_amount,
      totalAmount: s.total_amount,
      arsp: s.arsp,
      arspAmount: s.arsp_amount,
      subTotalCdf: s.sub_total_cdf ?? null,
      vatAmountCdf: s.vat_amount_cdf ?? null,
      totalAmountCdf: s.total_amount_cdf ?? null,
    };

    if (existing) {
      await db
        .update(quotations)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(quotations.id, existing.id));
    } else {
      await db.insert(quotations).values({
        quotationRef: s.quotation_ref,
        ...values,
      });
    }
  }
}
