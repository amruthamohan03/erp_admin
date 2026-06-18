import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { trackingTemplateMaster } from '@/db/schema';
import { orderedMilestones } from '@/lib/trackingTemplates';

// GET /api/v1/tracking-templates/{id}
// Returns one tracking_template_master_t row with milestones pre-parsed
// + sorted. The tracking detail page uses this to render the milestone
// chain alongside the current milestone — keeping the parse on the server
// means the client gets typed, ordered milestones with one round trip.
//
// Errors:
//   400 — id not a positive integer
//   401 — unauthenticated
//   404 — template not found / display='N'

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('id must be a positive integer');
  }

  const [row] = await db
    .select()
    .from(trackingTemplateMaster)
    .where(eq(trackingTemplateMaster.id, id))
    .limit(1);
  if (!row || row.display !== 'Y') {
    throw new NotFoundError(`Tracking template ${id} not found`);
  }

  return ok({
    id: row.id,
    templateKey: row.templateKey,
    name: row.name,
    description: row.description,
    licenseTypeId: row.licenseTypeId,
    milestones: orderedMilestones(row.milestonesJson),
  });
});
