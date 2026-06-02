// Admin CRUD over master_page (§4.12 page registration table).
// Runtime hits /api/pages/[slug]; this endpoint is for admins editing the
// configuration itself.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPage } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[master-pages.GET]', err);
    const msg = digErrorMessage(err);
    if (/relation .* does not exist/i.test(msg)) {
      return fail(
        'master_page table not found — run `pnpm db:migrate` to apply migration 0039 (page master tables + audit_log).',
        500,
        { code: 'missing_tables', detail: msg },
      );
    }
    return fail('Server error', 500, { detail: msg });
  }
}

// Walk the .cause chain to surface the deepest error message (Drizzle wraps pg
// errors so the outer .message is just "Failed query: ...").
function digErrorMessage(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  const seen = new WeakSet<object>();
  while (cur && typeof cur === 'object') {
    if (seen.has(cur as object)) break;
    seen.add(cur as object);
    const m = (cur as { message?: string }).message;
    if (typeof m === 'string') parts.push(m);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.length > 0 ? parts.join(' | ') : 'Unknown error';
}

const createSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, or hyphens'),
  title: z.string().min(1).max(200),
  route: z.string().min(1).max(200),
  target_table: z.string().min(1).max(100),
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
    // eslint-disable-next-line no-console
    console.error('[master-pages.POST]', err);
    return fail('Server error', 500);
  }
}
