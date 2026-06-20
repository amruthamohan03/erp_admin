import { NextRequest } from 'next/server';
import { and, asc, count, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotationCategoryMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  quotationCategoryCreateSchema,
  quotationCategoryListQuerySchema,
} from '@/schemas';

// GET /api/v1/quotation-categories?q=&page=&pageSize=
// List active quotation categories ordered by display_order so callers
// (including the quotation builder UI) get the sections in the right
// order without re-sorting client-side.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = quotationCategoryListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(quotationCategoryMaster.display, 'Y'),
        or(
          ilike(quotationCategoryMaster.categoryName, like),
          ilike(quotationCategoryMaster.categoryHeader, like),
        ),
      )
    : eq(quotationCategoryMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(quotationCategoryMaster)
    .where(where);

  const items = await db
    .select({
      id: quotationCategoryMaster.id,
      category_name: quotationCategoryMaster.categoryName,
      category_header: quotationCategoryMaster.categoryHeader,
      display_order: quotationCategoryMaster.displayOrder,
      is_customs: quotationCategoryMaster.isCustoms,
      display: quotationCategoryMaster.display,
      created_at: quotationCategoryMaster.createdAt,
      updated_at: quotationCategoryMaster.updatedAt,
    })
    .from(quotationCategoryMaster)
    .where(where)
    .orderBy(
      asc(quotationCategoryMaster.displayOrder),
      asc(quotationCategoryMaster.id),
    )
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = quotationCategoryCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(quotationCategoryMaster)
    .values({
      categoryName: data.category_name,
      categoryHeader: data.category_header ?? null,
      displayOrder: data.display_order,
      isCustoms: data.is_customs,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: quotationCategoryMaster.id,
      category_name: quotationCategoryMaster.categoryName,
      category_header: quotationCategoryMaster.categoryHeader,
      display_order: quotationCategoryMaster.displayOrder,
      is_customs: quotationCategoryMaster.isCustoms,
      display: quotationCategoryMaster.display,
      created_at: quotationCategoryMaster.createdAt,
    });

  return ok(row, 201);
});
