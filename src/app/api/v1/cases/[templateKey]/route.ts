import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { createCase } from '@/modules/case-runtime';

// POST /api/v1/cases/{templateKey}
// Generic create endpoint — delegates to case-runtime which validates the
// body against the form_definition's Zod schema before inserting into
// template.target_table. Errors:
//   401 — unauthenticated
//   404 — template/form/workflow not found
//   422 — body or values fail validation

const bodySchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

type Ctx = { params: Promise<{ templateKey: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { templateKey } = await params;
  const { values } = bodySchema.parse(await req.json());

  const result = await createCase({
    templateKey,
    actorUserId: session.uid,
    values,
  });
  return ok(result, 201);
});
