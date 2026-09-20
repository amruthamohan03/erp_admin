// §2 step 3 — the File Cancellation pickers: the client's licences that still
// carry a live file of the chosen kind, and the uncancelled files on the
// licences picked (a Local file has no licence, so it lists them all).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { fileCancellationOptionsQuery } from '@/schemas';
import { cancellableFiles, cancellableLicenses, fileSource } from '@/db/queries/fileCancellation';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/tracking/file-cancellation', 'view');
  if (isResponse(session)) return session;
  const q = fileCancellationOptionsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const [licenses, files] = await Promise.all([
    cancellableLicenses(q.kind, q.client_id),
    cancellableFiles(q.kind, q.client_id, q.license_ids),
  ]);
  return ok({ licensed: fileSource(q.kind).licensed, licenses, files });
});
