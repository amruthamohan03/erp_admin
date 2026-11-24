import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { IMPORT_SYNTHESIS_RESOURCE } from '@/schemas';
import { summariseFiles, synthesisFiles, synthesisLicense } from '@/db/queries/importSynthesis';

// GET /api/v1/import-synthesis/licenses/{id} — one licence, its balances, and its
// files with how far each has got towards the bank.
export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(IMPORT_SYNTHESIS_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const raw = (await params).id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError(`"${raw}" is not a valid licence id.`);

  const license = await synthesisLicense(id);
  if (!license) throw new NotFoundError(`Licence #${id} was not found. It may have been deleted — reload the list.`);
  const files = await synthesisFiles([id]);
  return ok({ license, summary: summariseFiles(license.fob, files), files });
});
