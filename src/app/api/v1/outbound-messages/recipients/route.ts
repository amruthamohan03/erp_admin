// GET /api/v1/outbound-messages/recipients — the composer's address book: every
// email and phone on an active client (labelled by short code, §4.15) or user.
// The operator can still type any address or number that is not in it.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recipientDirectory } from '@/db/queries/outboundMessages';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission('/communications', 'add');
  if (isResponse(session)) return session;
  return ok(await recipientDirectory());
});
