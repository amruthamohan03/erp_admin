import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotationCategoryMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: quotationCategoryMaster.id,
      category_name: quotationCategoryMaster.categoryName,
      category_header: quotationCategoryMaster.categoryHeader,
      display_order: quotationCategoryMaster.displayOrder,
      is_customs: quotationCategoryMaster.isCustoms,
      display: quotationCategoryMaster.display,
      created_at: quotationCategoryMaster.createdAt,
      updated_at: quotationCategoryMaster.updatedAt,
      created_by: quotationCategoryMaster.createdBy,
      updated_by: quotationCategoryMaster.updatedBy,
    })
    .from(quotationCategoryMaster)
    .where(eq(quotationCategoryMaster.display, 'Y'))
    .orderBy(asc(quotationCategoryMaster.displayOrder), asc(quotationCategoryMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  category_name: z.string().min(1).max(150),
  category_header: z.string().max(255).optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
  is_customs: z.boolean().optional(),
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
      .insert(quotationCategoryMaster)
      .values({
        categoryName: d.category_name,
        categoryHeader: d.category_header ?? d.category_name,
        displayOrder: d.display_order ?? 1,
        isCustoms: d.is_customs ?? false,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: quotationCategoryMaster.id });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'category name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[quotation-categories.POST]', err);
    return fail('Server error', 500);
  }
}
