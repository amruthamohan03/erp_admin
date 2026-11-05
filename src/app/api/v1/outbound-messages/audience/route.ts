// GET  /api/v1/outbound-messages/audience — the conditions on offer that no
//      master endpoint lists: each module's pending stages, labelled as on its
//      dashboard. Statuses and reasons come from their own masters.
// POST /api/v1/outbound-messages/audience — the clients whose tracking files
//      meet the conditions in the body (see `audienceSchema`), with their
//      contacts and how many files matched. A read, sent as POST because the
//      conditions are lists.
//
// Gated like sending (add on /communications): the answer is a list of client
// addresses, and it exists only to be written to.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { audienceStageOptions, resolveAudience } from '@/db/queries/outboundAudience';
import { audienceSchema } from '@/schemas';

const MENU = '/communications';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;
  return ok({ stages: audienceStageOptions() });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;
  const audience = audienceSchema.parse(await req.json());
  const clients = await resolveAudience(session, audience);
  return ok(clients, {
    meta: { total: clients.length, file_count: clients.reduce((s, c) => s + c.file_count, 0) },
  });
});
