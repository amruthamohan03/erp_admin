import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { localsT } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getLocalDetail } from '@/db/queries/locals';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/v1/locals/{id} — full detail (joined names).
export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const id = parseId((await params).id);
  if (!id) return fail('Invalid local id', 400);
  const row = await getLocalDetail(id);
  if (!row) return fail('Local not found', 404);
  return ok(row);
});

// DELETE /api/v1/locals/{id} — soft delete (display='N').
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const id = parseId((await params).id);
  if (!id) return fail('Invalid local id', 400);
  await db.update(localsT).set({ display: 'N', updatedBy: session.uid, updatedAt: new Date() }).where(eq(localsT.id, id));
  return ok({ id });
});
