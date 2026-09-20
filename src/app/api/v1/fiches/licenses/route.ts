// §2 step 3 — the fiche form's License Number options: licences with an import
// file a fiche can still be raised on (options_source 'fiches/licenses').
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheLicensesQuerySchema } from '@/schemas';
import { ficheLicenses } from '@/db/queries/fiches';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  const q = ficheLicensesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await ficheLicenses(q.current_license));
});
