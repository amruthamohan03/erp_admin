import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPage, type MasterPageInsert } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The page id in the address is not a number.');

  const [row] = await db
    .select({
      id: masterPage.id,
      slug: masterPage.slug,
      title: masterPage.title,
      route: masterPage.route,
      target_table: masterPage.targetTable,
      display_order: masterPage.displayOrder,
      display: masterPage.display,
      created_at: masterPage.createdAt,
      updated_at: masterPage.updatedAt,
    })
    .from(masterPage)
    .where(eq(masterPage.id, id));

  if (!row) throw new NotFoundError(`Page #${id} was not found. It may have been deleted — reload the list.`);
  return ok(row);
});

const updateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).max(200).optional(),
  route: z.string().min(1).max(200).optional(),
  target_table: z.string().min(1).max(100).optional(),
  display_order: z.coerce.number().int().min(0).optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The page id in the address is not a number.');

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const d = parsed.data;

    const patch: Partial<MasterPageInsert> = {};
    if (d.slug !== undefined) patch.slug = d.slug;
    if (d.title !== undefined) patch.title = d.title;
    if (d.route !== undefined) patch.route = d.route;
    if (d.target_table !== undefined) patch.targetTable = d.target_table;
    if (d.display_order !== undefined) patch.displayOrder = d.display_order;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(masterPage)
      .set(patch)
      .where(eq(masterPage.id, id))
      .returning({ id: masterPage.id });

    if (!row) throw new NotFoundError(`Page #${id} was not found. It may have been deleted — reload the list.`);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'page slug');
    if (dup) return dup;
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The page id in the address is not a number.');

  const [row] = await db
    .update(masterPage)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(masterPage.id, id))
    .returning({ id: masterPage.id });

  if (!row) throw new NotFoundError(`Page #${id} was not found. It may have been deleted — reload the list.`);
  return ok({ id: row.id });
});
