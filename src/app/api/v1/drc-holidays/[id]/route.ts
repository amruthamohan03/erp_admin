import { NextRequest } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { drcHolidays, type DrcHolidayInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { drcHolidayUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

/** The projection every handler here returns, with the date kept as text (§4.19). */
const selection = {
  id: drcHolidays.id,
  holiday_date: sql<string>`to_char(${drcHolidays.holidayDate}, 'YYYY-MM-DD')`,
  name_en: drcHolidays.nameEn,
  name_fr: drcHolidays.nameFr,
  holiday_type: drcHolidays.holidayType,
  display: drcHolidays.display,
  created_at: drcHolidays.createdAt,
  updated_at: drcHolidays.updatedAt,
};

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const [row] = await db.select(selection).from(drcHolidays).where(eq(drcHolidays.id, id)).limit(1);
  if (!row) throw new NotFoundError('Holiday not found');
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const data = drcHolidayUpdateSchema.parse(await req.json());

  const [before] = await db.select(selection).from(drcHolidays).where(eq(drcHolidays.id, id)).limit(1);
  if (!before) throw new NotFoundError('Holiday not found');

  // Moving a holiday onto a day another one already occupies — same reasoning as
  // the create, and excluding this row so saving it unchanged is not a clash.
  if (data.holiday_date && data.holiday_date !== before.holiday_date) {
    const [clash] = await db
      .select({ name_en: drcHolidays.nameEn })
      .from(drcHolidays)
      .where(
        and(
          eq(drcHolidays.holidayDate, data.holiday_date),
          eq(drcHolidays.display, 'Y'),
          ne(drcHolidays.id, id),
        ),
      )
      .limit(1);
    if (clash) {
      throw new ConflictError(
        `${data.holiday_date} is already recorded as "${clash.name_en}". Pick another date, or edit that holiday instead.`,
        { field: 'holiday_date' },
      );
    }
  }

  const patch: Partial<DrcHolidayInsert> = {};
  if (data.holiday_date !== undefined) patch.holidayDate = data.holiday_date;
  if (data.name_en !== undefined) patch.nameEn = data.name_en;
  if (data.name_fr !== undefined) patch.nameFr = data.name_fr;
  if (data.holiday_type !== undefined) patch.holidayType = data.holiday_type;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(drcHolidays)
      .set(patch)
      .where(eq(drcHolidays.id, id))
      .returning({ id: drcHolidays.id });
    if (!row) return null;

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'drc_holiday',
      entityId: String(id),
      before,
      after: data,
    });
    return row.id;
  });

  if (!updated) throw new NotFoundError('Holiday not found');
  return ok({ id: updated });
});

// §4.27 — soft delete. The row stays, so a delay figure computed over a past
// period can still explain which day it treated as a holiday.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(drcHolidays)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(drcHolidays.id, id))
      .returning({ id: drcHolidays.id });
    if (!row) return null;

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'drc_holiday',
      entityId: String(id),
    });
    return row.id;
  });

  if (!deleted) throw new NotFoundError('Holiday not found');
  return ok({ id: deleted });
});
