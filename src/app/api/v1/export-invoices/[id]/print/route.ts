// GET /api/v1/export-invoices/[id]/print?page=full|p1|p2 — printable HTML invoice
// (open in a new tab, then "Save as PDF"). p1 = Debit Note, p2 = Facture + MCA
// details, full = both. No PDF library is installed.
import { type NextRequest, NextResponse } from 'next/server';
import { fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildExportInvoicePrintHtml, type PrintPage } from '@/db/queries/exportInvoicePrint';

const PAGES = new Set<PrintPage>(['full', 'p1', 'p2']);

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid invoice id', 400);

    const raw = req.nextUrl.searchParams.get('page') ?? 'full';
    const page = PAGES.has(raw as PrintPage) ? (raw as PrintPage) : 'full';

    const html = await buildExportInvoicePrintHtml(id, page);
    if (!html) return fail('Invoice not found', 404);
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
);
