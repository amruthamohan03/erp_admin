import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { IMPORT_SYNTHESIS_RESOURCE } from '@/schemas';
import { synthesisClients } from '@/db/queries/importSynthesis';

// GET /api/v1/import-synthesis/kinds/{kindId}/clients — the clients holding licences of that kind.
export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ kindId: string }> }) => {
  const session = await requirePermission(IMPORT_SYNTHESIS_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const raw = (await params).kindId;
  const kindId = Number(raw);
  if (!Number.isInteger(kindId) || kindId <= 0) throw new BadRequestError(`"${raw}" is not a valid kind id.`);
  return ok(await synthesisClients(kindId));
});
