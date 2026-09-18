import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import {
  buildXlsx,
  dateStamp,
  xlsxResponse,
  XLSX_USD_ACCOUNTING,
  type XlsxColumn,
} from '@/lib/xlsx';
import { recordAudit } from '@/lib/audit/recordAudit';

// GET /api/v1/quotations/export — the client-wise quotation summary.
//
// One row per quotation, one money column per quotation category, and a Total.
// It is the sheet the commercial side prices against: reading ACROSS a row says
// what a client pays for a given product and transport mode, and reading DOWN a
// column compares that charge between clients.
//
// The customs category is deliberately EXCLUDED, columns and total alike. Those
// lines are government duties and taxes passed straight through — they are not
// the agency's charge, they vary per consignment rather than per client, and on
// an Import-Definitive quotation they are denominated in CDF while every other
// column here is USD. Including them would put two currencies in one Total.

/** Sorted by client code so a reader can scan one client's quotations together. */
interface SummaryRow {
  quotation_id: number;
  client_code: string | null;
  office_location: string | null;
  goods_type_name: string | null;
  transport_mode_name: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  // 1. The category columns, customs excluded. `is_customs` is the master's own
  // flag — main matched the NAME against 'CUSTOMS'/'CLEARANCE', so renaming the
  // category in French would have quietly put duties back into the total.
  const categories = (
    await db.execute(sql`
      SELECT id, category_name
      FROM quotation_category_master_t
      WHERE display = 'Y' AND COALESCE(is_customs, false) = false
      ORDER BY display_order ASC, id ASC`)
  ) as unknown as { rows: { id: number; category_name: string }[] };
  const cats = categories.rows;

  // 2. The quotations.
  const quotationRows = (
    await db.execute(sql`
      SELECT q.id AS quotation_id,
             c.short_name AS client_code,
             mo.main_location_name AS office_location,
             gt.goods_type AS goods_type_name,
             tm.transport_mode_name
      FROM quotations_t q
      LEFT JOIN client_master_t c ON c.id = q.client_id
      -- main joined transit_point_master_t here; in this schema
      -- client_master_t.office_location_id is a foreign key to
      -- main_office_master_t, so that is the table the id actually names.
      LEFT JOIN main_office_master_t mo ON mo.id = c.office_location_id
      LEFT JOIN transport_mode_master_t tm ON tm.id = q.transport_mode_id
      LEFT JOIN type_of_goods_master_t gt ON gt.id = q.goods_type_id
      WHERE q.display = 'Y'
      ORDER BY c.short_name ASC NULLS LAST, q.id ASC`)
  ) as unknown as { rows: SummaryRow[] };
  const quotations = quotationRows.rows;

  // 3. One grouped pass for every category subtotal, rather than a query per
  // quotation — a hundred quotations would otherwise be a hundred round trips.
  const sums = (
    await db.execute(sql`
      SELECT quotation_id, category_id, SUM(total_usd)::float8 AS cat_total
      FROM quotation_items_t
      WHERE display = 'Y'
      GROUP BY quotation_id, category_id`)
  ) as unknown as { rows: { quotation_id: number; category_id: number | null; cat_total: number }[] };

  const byQuotation = new Map<number, Map<number, number>>();
  for (const s of sums.rows) {
    if (s.category_id === null) continue;
    const bucket = byQuotation.get(s.quotation_id) ?? new Map<number, number>();
    bucket.set(s.category_id, Number(s.cat_total) || 0);
    byQuotation.set(s.quotation_id, bucket);
  }

  // main's layout: the four descriptive columns under a cyan header, the money
  // columns under a red one, accounting format with a $, a bold Total, thin
  // borders throughout and a tall wrapped header row.
  const TEXT_HEADER = 'FF00B0F0';
  const MONEY_HEADER = 'FFC00000';
  const text = (key: string, header: string, width: number): XlsxColumn => ({
    key, header, width, headerFill: TEXT_HEADER, align: 'center',
  });
  const money = (key: string, header: string, bold = false): XlsxColumn => ({
    key, header, width: 17, headerFill: MONEY_HEADER, align: 'right',
    numFmt: XLSX_USD_ACCOUNTING, bold,
  });
  const columns: XlsxColumn[] = [
    text('client_code', 'Client Code', 14),
    text('location', 'Location', 16),
    text('product', 'Product', 12),
    text('transport', 'Mode of Transport', 14),
    ...cats.map((c) => money(`cat_${c.id}`, c.category_name)),
    money('total', 'Total', true),
  ];

  const rows = quotations.map((q) => {
    const bucket = byQuotation.get(q.quotation_id);
    const row: Record<string, unknown> = {
      client_code: q.client_code ?? '',
      location: q.office_location ?? '',
      product: q.goods_type_name ?? '',
      transport: q.transport_mode_name ?? '',
    };
    // The Total is the sum of the columns ACTUALLY PRINTED, not the quotation's
    // stored `total_amount`. They differ by design — the stored total includes
    // customs and ARSP — and a Total that did not add up to the row beside it
    // is the first thing a reader would query.
    let total = 0;
    for (const c of cats) {
      const value = bucket?.get(c.id) ?? 0;
      row[`cat_${c.id}`] = value;
      total += value;
    }
    row.total = total;
    return row;
  });

  // §4.28 — an export is a logged action, and what it contained is the part
  // worth keeping.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'quotation',
    entityId: 'summary',
    metadata: { rows: rows.length, categories: cats.map((c) => c.category_name) },
  });

  const buf = await buildXlsx([
    { name: 'SUMMARY', columns, rows, borders: true, headerHeight: 38 },
  ]);
  // main's name; the stamp stays the sortable YYYYMMDD every export uses (§4.19).
  const res = xlsxResponse(buf, `Quotations_Summary_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
