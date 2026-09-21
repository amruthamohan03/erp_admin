// §2 step 3 — Tracking Management → File Cancellation.
//
// GET  → every cancelled Import / Export / Local file, for the screen's list.
// POST { kind, client_id, file_ids[], reason_id, cancelled_date }
//      → cancels them in one transaction: clearing status CANCELLED, the reason
//        and date recorded and written into the file's remarks, one audit entry
//        per file. Refused (409, records named) while a live invoice or payment
//        request still carries any of them. See db/queries/fileCancellation.ts.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { fileCancellationSchema } from '@/schemas';
import { cancelFiles, listCancelledFiles } from '@/db/queries/fileCancellation';

const MENU = '/tracking/file-cancellation';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(MENU, 'view');
  if (isResponse(session)) return session;
  return ok(await listCancelledFiles());
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'edit');
  if (isResponse(session)) return session;
  const body = fileCancellationSchema.parse(await req.json());
  const result = await cancelFiles({
    kind: body.kind,
    clientId: body.client_id,
    fileIds: [...new Set(body.file_ids)],
    reasonId: body.reason_id,
    cancelledDate: body.cancelled_date,
    actorId: session.uid,
    acknowledgePayments: body.acknowledge_payments,
  });
  return ok(result);
});
