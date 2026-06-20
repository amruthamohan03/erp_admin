import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { itemMaster, quotationCategoryMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { itemCreateSchema, itemListQuerySchema } from '@/schemas';

// GET /api/v1/items?q=&category_id=&item_type=&page=&pageSize=
// List active item-master rows joined with their quotation category so
// the admin grid + the quotation builder both get the human label
// without an extra hop. Filters: search across item_name / item_code,
// category_id (exact FK), item_type (substring — 'I' matches IE, IU,
// IEU since item_type is a 1–3 char trade-direction code).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = itemListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    category_id: searchParams.get('category_id') ?? undefined,
    item_type: searchParams.get('item_type') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(itemMaster.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(itemMaster.itemName, like),
      ilike(itemMaster.itemCode, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.category_id) conds.push(eq(itemMaster.categoryId, q.category_id));
  if (q.item_type) {
    // Substring match — 'I' should include IE, IU, IEU.
    conds.push(ilike(itemMaster.itemType, `%${q.item_type}%`));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(itemMaster)
    .where(where);

  const items = await db
    .select({
      id: itemMaster.id,
      item_name: itemMaster.itemName,
      item_code: itemMaster.itemCode,
      category_id: itemMaster.categoryId,
      category_name: quotationCategoryMaster.categoryName,
      tax_not_tax: itemMaster.taxNotTax,
      percentage: itemMaster.percentage,
      item_type: itemMaster.itemType,
      display: itemMaster.display,
      created_at: itemMaster.createdAt,
      updated_at: itemMaster.updatedAt,
    })
    .from(itemMaster)
    .leftJoin(
      quotationCategoryMaster,
      eq(quotationCategoryMaster.id, itemMaster.categoryId),
    )
    .where(where)
    .orderBy(desc(itemMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = itemCreateSchema.parse(await req.json());
  try {
    const [row] = await db
      .insert(itemMaster)
      .values({
        itemName: data.item_name,
        itemCode: data.item_code ?? null,
        categoryId: data.category_id ?? null,
        taxNotTax: data.tax_not_tax,
        percentage: String(data.percentage),
        itemType: data.item_type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: itemMaster.id,
        item_name: itemMaster.itemName,
        item_code: itemMaster.itemCode,
        category_id: itemMaster.categoryId,
        tax_not_tax: itemMaster.taxNotTax,
        percentage: itemMaster.percentage,
        item_type: itemMaster.itemType,
        display: itemMaster.display,
        created_at: itemMaster.createdAt,
      });
    return ok(row, 201);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23503') {
      throw new BadRequestError('Invalid category_id');
    }
    throw err;
  }
});
