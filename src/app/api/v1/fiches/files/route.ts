// §2 step 3 — the fiche form's MCA Reference options: the chosen licence's
// import files that are live, not cancelled and not already on another fiche
// (options_source 'fiches/files', optionsParams license_id + current).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheFilesQuerySchema } from '@/schemas';
import { ficheFiles } from '@/db/queries/fiches';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  const q = ficheFilesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await ficheFiles(q.license_id, q.current));
});
