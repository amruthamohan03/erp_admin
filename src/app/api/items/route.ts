import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { itemMaster, quotationCategoryMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const TAX_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'O', 'P'] as const;
const ITEM_TYPES = ['I', 'E', 'U', 'IE', 'IU', 'EU', 'IEU'] as const;

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
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
    .leftJoin(quotationCategoryMaster, eq(quotationCategoryMaster.id, itemMaster.categoryId))
    .where(eq(itemMaster.display, 'Y'))
    .orderBy(asc(itemMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  item_name: z.string().min(1).max(255),
  item_code: z.string().max(50).optional().nullable(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  tax_not_tax: z.enum(TAX_CLASSES),
  percentage: z.coerce.number().min(0).optional(),
  item_type: z.enum(ITEM_TYPES),
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
      .insert(itemMaster)
      .values({
        itemName: d.item_name,
        itemCode: d.item_code ?? null,
        categoryId: d.category_id ?? null,
        taxNotTax: d.tax_not_tax,
        percentage: d.percentage !== undefined ? String(d.percentage) : '0',
        itemType: d.item_type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: itemMaster.id });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[items.POST]', err);
    return fail('Server error', 500);
  }
}
