import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { doneByMaster, type DoneByMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { doneByUpdateSchema } from '@/schemas';
import { loadBranding } from '@/db/queries/branding';
import { resolveDoneByName } from '@/lib/doneByLabel';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({
        id: doneByMaster.id,
        done_by_name: doneByMaster.doneByName,
        is_company: doneByMaster.isCompany,
        display: doneByMaster.display,
        created_at: doneByMaster.createdAt,
        updated_at: doneByMaster.updatedAt,
      })
      .from(doneByMaster)
      .where(eq(doneByMaster.id, id))
      .limit(1);

    if (!row) throw new NotFoundError();
    const branding = await loadBranding();
    return ok({ ...row, done_by_name: resolveDoneByName(row, branding.project_name) });
  },
);

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const data = doneByUpdateSchema.parse(await req.json());

    const [current] = await db
      .select({ is_company: doneByMaster.isCompany })
      .from(doneByMaster)
      .where(eq(doneByMaster.id, id))
      .limit(1);
    if (!current) throw new NotFoundError();

    // The company row's label comes from branding, so accepting a rename here
    // would silently do nothing visible. Say so instead, and point at the setting
    // that does change it.
    const staysCompany = data.is_company ?? current.is_company;
    if (staysCompany && data.done_by_name !== undefined) {
      throw new BadRequestError(
        'This entry shows the configured project name — rename it under Settings → Application.',
      );
    }

    const patch: Partial<DoneByMasterInsert> = {};
    if (data.done_by_name !== undefined) patch.doneByName = data.done_by_name;
    if (data.display !== undefined) patch.display = data.display;
    if (data.is_company !== undefined) patch.isCompany = data.is_company;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(doneByMaster)
      .set(patch)
      .where(eq(doneByMaster.id, id))
      .returning({ id: doneByMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .update(doneByMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(doneByMaster.id, id))
      .returning({ id: doneByMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
