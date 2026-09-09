import { NextRequest } from 'next/server';
import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { drcHolidays } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { ConflictError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { drcHolidayCreateSchema, drcHolidayListQuerySchema } from '@/schemas';

// GET  /api/v1/drc-holidays?q=&year=&holiday_type=&page=&pageSize=
// POST /api/v1/drc-holidays
//
// The DRC's public holidays. Read by the Import/Export delay KPIs
// (`getHolidaySet`) to exclude non-working days, so a row here moves every
// processing-time figure the module reports.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = drcHolidayListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    year: searchParams.get('year') ?? undefined,
    holiday_type: searchParams.get('holiday_type') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(drcHolidays.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    // Both names: an operator looking for "Noël" and one looking for
    // "Christmas" are looking for the same row.
    const orClause = or(ilike(drcHolidays.nameEn, like), ilike(drcHolidays.nameFr, like));
    if (orClause) conds.push(orClause);
  }
  if (q.year) {
    conds.push(sql`EXTRACT(YEAR FROM ${drcHolidays.holidayDate}) = ${q.year}`);
  }
  if (q.holiday_type) conds.push(eq(drcHolidays.holidayType, q.holiday_type));
  const where = and(...conds);

  const [countRow] = await db.select({ total: count() }).from(drcHolidays).where(where);

  const items = await db
    .select({
      id: drcHolidays.id,
      // Cast in SQL: a `date` column comes back from the driver as a JS Date,
      // which then serialises as a UTC timestamp and can render a day early west
      // of Greenwich (§4.19). Text out, text all the way to the formatter.
      holiday_date: sql<string>`to_char(${drcHolidays.holidayDate}, 'YYYY-MM-DD')`,
      name_en: drcHolidays.nameEn,
      name_fr: drcHolidays.nameFr,
      holiday_type: drcHolidays.holidayType,
      display: drcHolidays.display,
      created_at: drcHolidays.createdAt,
      updated_at: drcHolidays.updatedAt,
    })
    .from(drcHolidays)
    .where(where)
    // Chronological, not newest-first: this is a calendar, and an operator
    // reviewing next year's holidays reads it in date order.
    .orderBy(asc(drcHolidays.holidayDate))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = drcHolidayCreateSchema.parse(await req.json());

  // One holiday per date. Two rows for the same day would be counted once by
  // the KPI (it builds a Set) but read as a duplicate on screen, so the list and
  // the delay figures would quietly disagree about what is on file.
  const [clash] = await db
    .select({ id: drcHolidays.id, name_en: drcHolidays.nameEn })
    .from(drcHolidays)
    .where(and(eq(drcHolidays.holidayDate, data.holiday_date), eq(drcHolidays.display, 'Y')))
    .limit(1);
  if (clash) {
    throw new ConflictError(
      `${data.holiday_date} is already recorded as "${clash.name_en}". Edit that holiday instead of adding a second one for the same day.`,
      { field: 'holiday_date' },
    );
  }

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(drcHolidays)
      .values({
        holidayDate: data.holiday_date,
        nameEn: data.name_en,
        nameFr: data.name_fr ?? null,
        holidayType: data.holiday_type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: drcHolidays.id,
        holiday_date: drcHolidays.holidayDate,
        name_en: drcHolidays.nameEn,
      });

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'drc_holiday',
      entityId: String(created.id),
      after: data,
    });
    return created;
  });

  return ok(row, { status: 201 });
});
