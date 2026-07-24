import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bivacPartial, importT } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/bivac/partials/{id}/files — the import files consuming this
// PARTIELLE (imports_t linked by inspection_reports = partial_name).
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid PARTIELLE id', 400);

  const [partial] = await db
    .select({ name: bivacPartial.partialName })
    .from(bivacPartial)
    .where(and(eq(bivacPartial.id, id), eq(bivacPartial.display, 'Y')))
    .limit(1);
  if (!partial) return fail('PARTIELLE not found', 404);

  const files = await db
    .select({
      id: importT.id,
      mca_ref: importT.mcaRef,
      inspection_reports: importT.inspectionReports,
      declaration_reference: importT.declarationReference,
      dgda_in_date: importT.dgdaInDate,
      liquidation_reference: importT.liquidationReference,
      liquidation_date: importT.liquidationDate,
      quittance_reference: importT.quittanceReference,
      quittance_date: importT.quittanceDate,
      weight: importT.weight,
      fob: importT.fob,
    })
    .from(importT)
    .where(and(eq(importT.inspectionReports, partial.name), eq(importT.display, 'Y')))
    .orderBy(asc(importT.id));

  return ok(files);
});
