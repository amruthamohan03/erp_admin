// §2 step 3 — GET /api/v1/fiches/{id}/print: the printable Fiche de Calcul,
// opened in a new tab and saved as PDF from the browser (no PDF library, §3).
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheIdSchema } from '@/schemas';
import { buildFichePrintHtml } from '@/db/queries/fichePrint';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  const id = ficheIdSchema.parse((await params).id);

  const html = await buildFichePrintHtml(id);
  if (!html) return fail('This fiche no longer exists — reload the list.', 404);

  // §4.28 — printing is logged: it is where the fiche leaves the system as paper.
  await recordAudit(db, { actorId: session.uid, action: 'print', entityType: 'page:fiche', entityId: id });

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
