// POST /api/v1/notifications/read { ids } | { all: true, kind? } — mark read for
// the signed-in user only; other members of the role keep their own unread state.
import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { markReadSchema } from '@/schemas';
import { markRead } from '@/db/queries/notifications';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const body = markReadSchema.parse(await req.json());
  const marked = await markRead(
    { userId: session.uid, roleId: session.role_id },
    body.all ? 'all' : (body.ids ?? []),
    body.kind,
  );
  return ok({ marked });
});
