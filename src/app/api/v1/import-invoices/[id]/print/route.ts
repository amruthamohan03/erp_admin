// GET /api/v1/import-invoices/[id]/print — printable HTML invoice (open in a new
// tab, then "Save as PDF"). No PDF library is installed; this returns a
// self-contained document with a Print button.
import { type NextRequest, NextResponse } from 'next/server';
import { fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildImportInvoicePrintHtml } from '@/db/queries/importInvoicePrint';

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid invoice id', 400);

    const html = await buildImportInvoicePrintHtml(id);
    if (!html) return fail('Invoice not found', 404);
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
);
