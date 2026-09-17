import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentExportQuerySchema } from '@/schemas';
import { paymentQueryInput } from '@/lib/payments/query';
import { getRoleStageInfo, exportPayments, type PaymentExportRow } from '@/db/queries/payments';
import { paymentStatus, PAY_FOR_LABELS } from '@/lib/payments/stages';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxRowTone } from '@/lib/xlsx';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { recordAudit } from '@/lib/audit/recordAudit';

// GET /api/v1/payments/export?from=&to=&status_filter=&q=&client_id=&department=
//                            &pay_for=&payment_type=&currency=&expense_type=
//
// The list as a spreadsheet, under exactly the filters the grid is showing —
// `paymentFilterSchema` is shared with GET /payments, so a filter cannot apply
// to one and not the other (§4.15). The row scoping is shared too: a
// non-approver exports only what they raised, the same rows they can see.
//
// The approval trail travels with each request (who approved each stage, when,
// and what they wrote), because that is usually the reason the sheet was asked
// for in the first place.

/**
 * A cap, not a page.
 *
 * An export of "page 1 of 40" is not an export, so this is deliberately far
 * above any realistic filtered range — but a download link with NO bound is a
 * way to exhaust the server with one click on an unfiltered list. When the cap
 * bites, the sheet says so in its own last row rather than just ending, because
 * a truncated spreadsheet that looks complete is the failure worth preventing.
 */
const MAX_ROWS = 20_000;

/** §4.19 — a date a person reads, and a spreadsheet leaves the office. */
const day = (v: unknown): string => formatDate(v, '');
const stamp = (v: unknown): string => formatDateTime(v, '');

const money = (v: unknown): number | string => {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

/**
 * Colour by outcome, the same three readings the list badge uses: settled is
 * green, refused is red, and anything still moving is left unpainted so the two
 * that need attention are the ones that stand out.
 */
function toneOf(row: Record<string, unknown>): XlsxRowTone | null {
  switch (row.status_key) {
    case 'paid':
      return 'success';
    case 'rejected':
      return 'danger';
    default:
      return null;
  }
}

/** One spreadsheet row per request, with every id already resolved to a name. */
function sheetRow(r: PaymentExportRow): Record<string, unknown> {
  const status = paymentStatus(r);
  return {
    id: r.id,
    created_at: day(r.created_at),
    status: status.label,
    // Not a column — `toneOf` reads it and `columns` never names it, so it
    // steers the fill without appearing in the sheet.
    status_key: status.key,
    requestee: r.requestee,
    beneficiary: r.beneficiary ?? '',
    client_name: r.client_name ?? '',
    department_name: r.department_name ?? '',
    location_name: r.location_name ?? '',
    pay_for: r.pay_for == null ? '' : PAY_FOR_LABELS[r.pay_for] ?? '',
    payment_type: r.payment_type ?? '',
    expense_type_name: r.expense_type_name ?? '',
    currency_short_name: r.currency_short_name ?? '',
    amount: money(r.amount),
    chargeback: r.chargeback == null ? '' : money(r.chargeback),
    mca_count: r.mca_count,
    mca_refs: r.mca_refs ?? '',
    motif: r.motif ?? '',
    cash_collector: r.cash_collector ?? '',
    created_by_name: r.created_by_name ?? '',
    resubmit_count: r.resubmit_count,
    resubmitted_at: stamp(r.resubmitted_at),
    dept_approved_at: stamp(r.dept_approved_at),
    dept_approved_by_name: r.dept_approved_by_name ?? '',
    dept_notes: r.dept_notes ?? '',
    finance_approved_at: stamp(r.finance_approved_at),
    finance_approved_by_name: r.finance_approved_by_name ?? '',
    finance_notes: r.finance_notes ?? '',
    management_approved_at: stamp(r.management_approved_at),
    management_approved_by_name: r.management_approved_by_name ?? '',
    management_notes: r.management_notes ?? '',
    under_process_at: stamp(r.under_process_at),
    under_process_by_name: r.under_process_by_name ?? '',
    under_process_notes: r.under_process_notes ?? '',
    paid_approved_at: stamp(r.paid_approved_at),
    paid_approved_by_name: r.paid_approved_by_name ?? '',
    paid_notes: r.paid_notes ?? '',
  };
}

const COLUMNS = [
  { key: 'id', header: 'Request #', width: 11 },
  { key: 'created_at', header: 'Request Date', width: 14 },
  { key: 'status', header: 'Status', width: 16 },
  { key: 'requestee', header: 'Requestee', width: 22 },
  { key: 'beneficiary', header: 'Beneficiary', width: 24 },
  { key: 'client_name', header: 'Client', width: 12 },
  { key: 'department_name', header: 'Department', width: 18 },
  { key: 'location_name', header: 'Location', width: 18 },
  { key: 'pay_for', header: 'Payment For', width: 14 },
  { key: 'payment_type', header: 'Payment Type', width: 13 },
  { key: 'expense_type_name', header: 'Expense Type', width: 22 },
  { key: 'currency_short_name', header: 'Currency', width: 10 },
  { key: 'amount', header: 'Amount', width: 14 },
  { key: 'chargeback', header: 'Chargeback', width: 13 },
  { key: 'mca_count', header: 'Refs', width: 7 },
  { key: 'mca_refs', header: 'References', width: 34 },
  { key: 'motif', header: 'Motif', width: 40 },
  { key: 'cash_collector', header: 'Cash Collector', width: 20 },
  { key: 'created_by_name', header: 'Raised By', width: 20 },
  { key: 'resubmit_count', header: 'Re-submissions', width: 14 },
  { key: 'resubmitted_at', header: 'Re-submitted On', width: 18 },
  { key: 'dept_approved_at', header: 'Dept On', width: 18 },
  { key: 'dept_approved_by_name', header: 'Dept By', width: 20 },
  { key: 'dept_notes', header: 'Dept Note', width: 28 },
  { key: 'finance_approved_at', header: 'Finance On', width: 18 },
  { key: 'finance_approved_by_name', header: 'Finance By', width: 20 },
  { key: 'finance_notes', header: 'Finance Note', width: 28 },
  { key: 'management_approved_at', header: 'Management On', width: 18 },
  { key: 'management_approved_by_name', header: 'Management By', width: 20 },
  { key: 'management_notes', header: 'Management Note', width: 28 },
  { key: 'under_process_at', header: 'Under Process On', width: 18 },
  { key: 'under_process_by_name', header: 'Under Process By', width: 20 },
  { key: 'under_process_notes', header: 'Under Process Note', width: 28 },
  { key: 'paid_approved_at', header: 'Paid On', width: 18 },
  { key: 'paid_approved_by_name', header: 'Paid By', width: 20 },
  { key: 'paid_notes', header: 'Paid Note', width: 28 },
];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const filters = paymentExportQuerySchema.parse(paymentQueryInput(searchParams));

  const roleInfo = await getRoleStageInfo(session.role_id);
  // One over the cap, so a full page is distinguishable from a page that was cut.
  const rows = await exportPayments(roleInfo, session.uid, filters, MAX_ROWS + 1);
  const truncated = rows.length > MAX_ROWS;
  const included = truncated ? rows.slice(0, MAX_ROWS) : rows;

  const sheetRows = included.map(sheetRow);
  if (truncated) {
    sheetRows.push({
      id: '',
      created_at: '',
      status: `Only the first ${MAX_ROWS.toLocaleString('en-US')} requests are included — narrow the date range and export again.`,
    });
  }

  // §4.28 — an export is a logged action, and WHAT was exported is the part
  // worth keeping: "someone exported payments" answers nothing a month later.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'payment_request',
    entityId: 'list',
    metadata: { filters, rows: included.length, truncated },
  });

  const range =
    filters.from || filters.to
      ? `_${filters.from ?? 'start'}_to_${filters.to ?? 'today'}`.replace(/-/gu, '')
      : '';

  const buf = await buildXlsx([
    { name: 'Payment Requests', columns: COLUMNS, rows: sheetRows, rowTone: toneOf },
  ]);
  // Re-wrapped as a NextResponse because `withErrorHandler` is typed to it; the
  // body and headers are xlsxResponse's own (same as the other export routes).
  const res = xlsxResponse(buf, `payment_requests${range}_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
