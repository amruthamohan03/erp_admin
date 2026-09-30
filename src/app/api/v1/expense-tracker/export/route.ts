import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, XLSX_USD_ACCOUNTING, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { getExpenseTracker } from '@/db/queries/expenseTracker';
import { expenseTrackerQuerySchema } from '@/schemas';

// GET /api/v1/expense-tracker/export — the same list, as a spreadsheet.
//
// Parses the SAME schema as the list route, so the sheet can never be built
// from fewer filters than the screen it exports (§4.15): an export of a
// filtered list has to contain the rows that list was showing.

/** Everything matching, not one page — a report that stopped at 20 rows is a bug. */
const EXPORT_LIMIT = 5000;

const MODULE_LABEL: Record<string, string> = {
  import: 'Import',
  export: 'Export',
  local: 'Local',
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = expenseTrackerQuerySchema.parse({
    module: searchParams.get('module') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    outcome: searchParams.get('outcome') ?? undefined,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  const result = await getExpenseTracker({
    module: q.module,
    clientId: q.client_id ?? null,
    q: q.q ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
    outcome: q.outcome,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  const columns: XlsxColumn[] = [
    { key: 'module', header: 'Module', width: 12 },
    { key: 'mca_ref', header: 'MCA Reference', width: 24 },
    { key: 'client_name', header: 'Client', width: 12 },
    { key: 'clearing_status', header: 'Clearing Status', width: 22 },
    { key: 'file_date', header: 'File Date', width: 14 },
    { key: 'invoiced', header: 'Invoiced (USD)', width: 16, numFmt: XLSX_USD_ACCOUNTING, align: 'right' },
    { key: 'paid_spend', header: 'Paid (USD)', width: 16, numFmt: XLSX_USD_ACCOUNTING, align: 'right' },
    { key: 'profit', header: 'Profit (USD)', width: 16, numFmt: XLSX_USD_ACCOUNTING, align: 'right', bold: true },
    { key: 'margin_pct', header: 'Margin %', width: 11, align: 'right' },
    { key: 'pending_spend', header: 'Pending (USD)', width: 16, numFmt: XLSX_USD_ACCOUNTING, align: 'right' },
    { key: 'request_count', header: 'Requests', width: 10, align: 'right' },
    { key: 'invoice_count', header: 'Invoices', width: 10, align: 'right' },
    { key: 'note', header: 'Note', width: 44 },
  ];

  const rows = result.items.map((r) => ({
    module: MODULE_LABEL[r.module] ?? r.module,
    mca_ref: r.mca_ref,
    client_name: r.client_name ?? '',
    clearing_status: r.clearing_status ?? '',
    // §4.19 — a spreadsheet cell is display, and the most easily missed place
    // to break the rule, because nobody looks at it in the browser.
    file_date: formatDate(r.file_date, ''),
    invoiced: r.invoiced,
    paid_spend: r.paid_spend,
    profit: r.profit,
    margin_pct: r.margin_pct ?? '',
    pending_spend: r.pending_spend,
    request_count: r.request_count,
    invoice_count: r.invoice_count,
    // Says on the row itself why a figure may not be what it looks like. A
    // sheet leaves the office and is read by somebody who cannot ask.
    note: [
      r.shared_invoice ? 'Invoice shared with other files — equal share shown' : '',
      r.incomplete ? `${r.other_currency_spend_count} request(s) in another currency, not included` : '',
    ]
      .filter(Boolean)
      .join('; '),
  }));

  // §4.28 — an export is a logged action, and the filter it ran under is part
  // of what was exported.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'expense_tracker',
    entityId: 'list',
    module: 'expense-tracker',
    after: {
      rows: rows.length,
      module: q.module,
      client_id: q.client_id ?? null,
      outcome: q.outcome,
      from: q.from ?? null,
      to: q.to ?? null,
      q: q.q || null,
    },
  });

  const buf = await buildXlsx([{ name: 'Expense Tracker', columns, rows }]);
  const res = xlsxResponse(buf, `expense-tracker-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
