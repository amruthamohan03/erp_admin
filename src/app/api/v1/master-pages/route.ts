// Admin CRUD over master_page (§4.12 page registration table).
// Runtime hits /api/v1/pages/[slug]; this endpoint is for admins editing the
// configuration itself. Ported from main's /api/master-pages onto this
// branch's /api/v1 + requireAuth + {ok,data} envelope conventions.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPage } from '@/db/schema';
import { ok, fail, requireAuth, isResponse } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const rows = await db
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
    .orderBy(asc(masterPage.displayOrder), asc(masterPage.id));

  return ok(rows);
}

const createSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, or hyphens'),
  title: z.string().min(1).max(200),
  route: z.string().min(1).max(200),
  target_table: z.string().min(1).max(100),
  display_order: z.coerce.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const [row] = await db
      .insert(masterPage)
      .values({
        slug: d.slug,
        title: d.title,
        route: d.route,
        targetTable: d.target_table,
        displayOrder: d.display_order ?? 1,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: masterPage.id });

    return ok({ id: row.id }, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'page slug');
    if (dup) return dup;
    console.error('[master-pages.POST]', err);
    return fail('Server error', 500);
  }
}
