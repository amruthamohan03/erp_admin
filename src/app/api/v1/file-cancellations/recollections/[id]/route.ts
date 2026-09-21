// PUT /api/v1/file-cancellations/recollections/{id}
// { status: 'recovered' | 'written_off' | 'pending', recovered_amount, recovered_date, note }
//
// Record what became of money paid on a file that was then cancelled. The
// payment request itself is untouched — this is the recovery against it.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recollectionIdSchema, recollectionUpdateSchema } from '@/schemas';
import { updateRecollection } from '@/db/queries/fileCancellation';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/tracking/file-cancellation', 'edit');
  if (isResponse(session)) return session;
  const id = recollectionIdSchema.parse((await params).id);
  const body = recollectionUpdateSchema.parse(await req.json());
  await updateRecollection(id, body, session.uid);
  return ok({ id });
});
