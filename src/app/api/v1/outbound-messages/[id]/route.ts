// GET /api/v1/outbound-messages/{id} — one sent message in full: every
// recipient, how each fared, the body, and its attachments (downloadable via
// /api/v1/files/{id}/view).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { getOutbound } from '@/db/queries/outboundMessages';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/communications', 'view');
  if (isResponse(session)) return session;
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError(`"${raw}" is not a message number.`);
  const row = await getOutbound(id);
  if (!row) throw new NotFoundError(`Message #${id} was not found. It may have been removed — reload the list.`);
  return ok(row);
});
