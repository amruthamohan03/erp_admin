import { NextRequest } from 'next/server';
import { ok, fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BIVAC_RESOURCE, getActivePartialName, listFilesForPartial } from '@/db/queries/bivac';

// GET /api/v1/bivac/partials/{id}/files — the import files consuming this
// PARTIELLE (imports_t linked by inspection_reports = partial_name).
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'view');
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail(`"${(await params).id}" is not a valid PARTIELLE id.`, 400);

  const name = await getActivePartialName(id);
  if (!name) return fail(`PARTIELLE #${id} was not found. It may have been deleted — reload the list.`, 404);

  return ok(await listFilesForPartial(name));
});
