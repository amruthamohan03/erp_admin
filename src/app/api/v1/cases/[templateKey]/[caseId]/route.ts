import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { readCase } from '@/modules/case-runtime';

// GET /api/v1/cases/{templateKey}/{caseId}
// Returns the case row + the transitions available from its current state,
// in one round trip. Used by detail pages to render entity fields + advance
// buttons. Errors:
//   400 — caseId not a positive integer
//   401 — unauthenticated
//   404 — template not found, or no row with that id in template.target_table

type Ctx = { params: Promise<{ templateKey: string; caseId: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { templateKey, caseId: rawCaseId } = await params;
  const caseId = parseInt(rawCaseId, 10);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    throw new BadRequestError('caseId must be a positive integer');
  }

  const result = await readCase({ templateKey, caseId });
  return ok(result);
});
