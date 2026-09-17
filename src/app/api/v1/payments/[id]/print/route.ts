// GET /api/v1/payments/{id}/print — the printable DEMANDE DE FONDS.
//
// Opened in a new tab and saved as PDF from the browser; no PDF library is
// installed (§3), which is the same approach the invoice print routes take.
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildPaymentRequestPrintHtml } from '@/db/queries/paymentRequestPrint';
import { recordAudit } from '@/lib/audit/recordAudit';

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid payment id', 400);

    const html = await buildPaymentRequestPrintHtml(id);
    if (!html) return fail('Payment request not found', 404);

    // §4.28 — printing is a logged action like any other. It is the point at
    // which the request leaves the system as paper, so who produced that paper
    // and when is exactly what an audit of it needs.
    await recordAudit(db, {
      actorId: session.uid,
      action: 'print',
      entityType: 'payment_request',
      entityId: String(id),
    });

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
);
