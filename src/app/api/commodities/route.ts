import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, ilike, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { commodityMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)),
  );
  const offset = (page - 1) * pageSize;

  const like = search ? `%${search}%` : null;
  const whereClause = like
    ? and(eq(commodityMaster.display, 'Y'), ilike(commodityMaster.commodityName, like))
    : eq(commodityMaster.display, 'Y');

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: commodityMaster.id,
        commodity_name: commodityMaster.commodityName,
        display: commodityMaster.display,
        created_at: commodityMaster.createdAt,
        updated_at: commodityMaster.updatedAt,
        created_by: commodityMaster.createdBy,
        updated_by: commodityMaster.updatedBy,
      })
      .from(commodityMaster)
      .where(whereClause)
      .orderBy(desc(commodityMaster.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(commodityMaster).where(whereClause),
  ]);

  return ok({ items: rows, total: countRow.total, page, pageSize });
}

const createSchema = z.object({
  commodity_name: z.string().min(1).max(255),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const [row] = await db
      .insert(commodityMaster)
      .values({
        commodityName: d.commodity_name,
        createdBy: session.uid,
      })
      .returning({
        id: commodityMaster.id,
        commodity_name: commodityMaster.commodityName,
        display: commodityMaster.display,
        created_at: commodityMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'commodity name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[commodities.POST]', err);
    return fail('Server error', 500);
  }
}
