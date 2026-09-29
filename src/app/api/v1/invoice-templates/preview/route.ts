import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { renderInvoice } from '@/lib/invoiceTemplates/render';
import { SAMPLE_INVOICE } from '@/lib/invoiceTemplates/sample';
import { loadBranding } from '@/db/queries/branding';
import { invoiceTemplatePreviewQuerySchema } from '@/schemas';

// GET /api/v1/invoice-templates/preview?layout=&options= — the template master's
// live preview, rendered by the SAME function that prints the real facture
// (§4.10). A separate preview renderer would drift, and the drift would only
// show up on an invoice already sent to a client.
//
// Takes the template from the QUERY rather than by id, so the master previews
// what is on screen including unsaved edits — an operator picking an accent
// colour sees it before committing.
//
// Returns HTML, not the JSON envelope: the response is loaded straight into an
// iframe, which is §4.4's stated exception for a non-JSON response.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = invoiceTemplatePreviewQuerySchema.parse({
    layout: searchParams.get('layout') ?? undefined,
    options: searchParams.get('options') ?? undefined,
  });

  // §4.1 — the letterhead names the deployment, exactly as the real facture
  // does, so the preview is not the only place a hardcoded name appears.
  const branding = await loadBranding();

  const html = renderInvoice(
    { ...SAMPLE_INVOICE, company_name: branding.project_name },
    { layout: q.layout, options: q.options },
    // No print button: inside the preview pane printing the SAMPLE is not
    // something an operator would ever want, and a control that does the wrong
    // thing is worse than one that is absent (§4.25.1).
    { interactive: false },
  );

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A preview must never be a stale one — an operator changing a colour and
      // seeing the previous render would conclude the setting does nothing.
      'Cache-Control': 'no-store',
    },
  });
});
