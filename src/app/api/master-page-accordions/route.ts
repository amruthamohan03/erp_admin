import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPageAccordion } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const pageIdRaw = searchParams.get('page_id');
  if (!pageIdRaw) return fail('page_id is required', 400);
  const pageId = Number(pageIdRaw);
  if (Number.isNaN(pageId)) return fail('Invalid page_id', 400);

  const rows = await db
    .select({
      id: masterPageAccordion.id,
      page_id: masterPageAccordion.pageId,
      slug: masterPageAccordion.slug,
      title: masterPageAccordion.title,
      icon: masterPageAccordion.icon,
      display_order: masterPageAccordion.displayOrder,
      display: masterPageAccordion.display,
      created_at: masterPageAccordion.createdAt,
      updated_at: masterPageAccordion.updatedAt,
    })
    .from(masterPageAccordion)
    .where(eq(masterPageAccordion.pageId, pageId))
    .orderBy(asc(masterPageAccordion.displayOrder), asc(masterPageAccordion.id));

  return ok(rows);
}

const createSchema = z.object({
  page_id: z.coerce.number().int().positive(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  icon: z.string().max(100).optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
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
      .insert(masterPageAccordion)
      .values({
        pageId: d.page_id,
        slug: d.slug,
        title: d.title,
        icon: d.icon ?? null,
        displayOrder: d.display_order ?? 1,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: masterPageAccordion.id });

    return ok({ id: row.id }, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'accordion slug (within this page)');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[master-page-accordions.POST]', err);
    return fail('Server error', 500);
  }
}
