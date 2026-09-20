// §2 step 3 / §4.27 — DELETE /api/v1/fiches/{id}: soft delete. Refused once
// the fiche has reached a final workflow state (Audited, as seeded).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheIdSchema } from '@/schemas';
import { deleteFiche } from '@/db/queries/fiches';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/fiches', 'delete');
  if (isResponse(session)) return session;
  const id = ficheIdSchema.parse((await params).id);
  return ok(await deleteFiche(id, session.uid));
});
