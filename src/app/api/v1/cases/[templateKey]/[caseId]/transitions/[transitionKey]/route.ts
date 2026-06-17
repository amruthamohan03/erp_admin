import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { advanceCase } from '@/modules/case-runtime';

// POST /api/v1/cases/{templateKey}/{caseId}/transitions/{transitionKey}
// Apply a workflow transition. Body is optional and carries form-style
// inputs that the rule gate or action_json expressions can reference via
// { var: "payload.foo" }. Errors:
//   400 — caseId not a positive integer, or entity has no string state col
//   401 — unauthenticated
//   403 — rule gate denied (e.g. license.no_self_approve)
//   404 — template / case / transition not found
//   409 — entity's state has drifted so the transition no longer applies

const bodySchema = z
  .object({
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

type Ctx = {
  params: Promise<{
    templateKey: string;
    caseId: string;
    transitionKey: string;
  }>;
};

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { templateKey, caseId: rawCaseId, transitionKey } = await params;
  const caseId = parseInt(rawCaseId, 10);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    throw new BadRequestError('caseId must be a positive integer');
  }

  // The body is optional for transitions that don't need extra inputs (e.g.
  // submit/reject), so a fully empty request is fine.
  const parsed = bodySchema.parse(await req.json().catch(() => undefined));

  const result = await advanceCase({
    templateKey,
    caseId,
    transitionKey,
    actorUserId: session.uid,
    actorRoleId: session.role_id,
    payload: parsed?.payload,
  });
  return ok(result);
});
