// §2 step 3 / §4.6 — POST /api/v1/fiches/{id}/transition { transition_key }:
// move a fiche along the `fiche_de_calcul` workflow (Verify, Audit, …). Which
// steps exist, where they lead, their gates and the fields they stamp are all
// workflow_transition_master_t rows. The menu grant is Approve on /fiches; a
// transition's own rule gate or approval action narrows it further.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheIdSchema, ficheTransitionSchema } from '@/schemas';
import { transitionFiche } from '@/db/queries/fiches';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/fiches', 'approve');
  if (isResponse(session)) return session;
  const id = ficheIdSchema.parse((await params).id);
  const { transition_key } = ficheTransitionSchema.parse(await req.json());
  return ok(await transitionFiche(id, transition_key, { userId: session.uid, roleId: session.role_id }));
});
