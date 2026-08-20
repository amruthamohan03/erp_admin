import { clearAuthCookie, getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ok, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';

// §4.28 — logout is a logged action. Read the session BEFORE clearing the
// cookie: afterwards there is no one left to attribute the entry to.
//
// An unauthenticated call still succeeds (clearing an absent cookie is a no-op)
// but records nothing — there is no event to describe.
export const POST = withErrorHandler(async () => {
  const session = await getSession();

  if (session) {
    await recordAudit(db, {
      actorId: session.uid,
      action: 'logout',
      entityType: 'auth',
      entityId: String(session.uid),
      module: 'auth',
      actorRole: session.role_name,
      metadata: { username: session.username },
    });
  }

  await clearAuthCookie();
  return ok({ message: 'Logged out' });
});
