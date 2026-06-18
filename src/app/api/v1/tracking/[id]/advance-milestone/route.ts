import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { advanceTrackingMilestone } from '@/lib/tracking';
import { advanceMilestoneRequestSchema } from '@/schemas/tracking';

// POST /api/v1/tracking/{id}/advance-milestone
// Mark a milestone as completed on a tracking row. Linear forward advance;
// see src/lib/tracking.ts for the rules enforced.
//
// Body: { milestoneKey: string }
//
// Errors:
//   400 — tracking id not a positive integer, body invalid, or milestone
//         key isn't in the run's template
//   401 — unauthenticated
//   404 — tracking row or template not found
//   409 — tracking not in_progress, or milestone doesn't advance forward

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: rawId } = await params;
  const trackingId = parseInt(rawId, 10);
  if (!Number.isInteger(trackingId) || trackingId <= 0) {
    throw new BadRequestError('tracking id must be a positive integer');
  }

  const body = advanceMilestoneRequestSchema.parse(await req.json());

  const result = await advanceTrackingMilestone({
    trackingId,
    milestoneKey: body.milestoneKey,
    actorUserId: session.uid,
  });
  return ok(result);
});
