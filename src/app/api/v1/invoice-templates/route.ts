import { NextRequest } from 'next/server';
import { and, asc, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceTemplateMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { invoiceTemplateCreateSchema, invoiceTemplateListQuerySchema } from '@/schemas';

// The invoice PDF designs (§4.1). Also the `options_source` behind the Import
// Invoice's Invoice Template dropdown, which reads `template_code` as the value
// and `template_name` as the label.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = invoiceTemplateListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  // Every column the list shows is searchable, so typing what is on screen
  // finds the row (§4.15's pairing).
  const where = like
    ? and(
        eq(invoiceTemplateMaster.display, 'Y'),
        or(
          ilike(invoiceTemplateMaster.templateCode, like),
          ilike(invoiceTemplateMaster.templateName, like),
          ilike(invoiceTemplateMaster.description, like),
          ilike(invoiceTemplateMaster.layout, like),
        ),
      )
    : eq(invoiceTemplateMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(invoiceTemplateMaster)
    .where(where);

  const items = await db
    .select({
      id: invoiceTemplateMaster.id,
      template_code: invoiceTemplateMaster.templateCode,
      template_name: invoiceTemplateMaster.templateName,
      description: invoiceTemplateMaster.description,
      layout: invoiceTemplateMaster.layout,
      options: invoiceTemplateMaster.options,
      is_default: invoiceTemplateMaster.isDefault,
      display: invoiceTemplateMaster.display,
      created_at: invoiceTemplateMaster.createdAt,
      updated_at: invoiceTemplateMaster.updatedAt,
    })
    .from(invoiceTemplateMaster)
    .where(where)
    .orderBy(asc(invoiceTemplateMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = invoiceTemplateCreateSchema.parse(await req.json());

  try {
    const row = await db.transaction(async (tx) => {
      // Only one row may be the default, and the partial unique index enforces
      // it — so the previous holder is stood down in the SAME transaction
      // rather than letting the insert fail with a constraint name (§4.23).
      if (data.is_default) await clearDefault(tx);

      const [created] = await tx
        .insert(invoiceTemplateMaster)
        .values({
          templateCode: data.template_code,
          templateName: data.template_name.trim(),
          description: data.description?.trim() || null,
          layout: data.layout,
          options: data.options,
          isDefault: data.is_default,
          createdBy: session.uid,
          updatedBy: session.uid,
        })
        .returning({
          id: invoiceTemplateMaster.id,
          template_code: invoiceTemplateMaster.templateCode,
          template_name: invoiceTemplateMaster.templateName,
          layout: invoiceTemplateMaster.layout,
          is_default: invoiceTemplateMaster.isDefault,
          created_at: invoiceTemplateMaster.createdAt,
        });
      return created;
    });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Template Code');
    if (dup) return dup;
    throw err;
  }
});

/** Stand down whichever row currently holds the default. */
export async function clearDefault(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  exceptId?: number,
): Promise<void> {
  await tx
    .update(invoiceTemplateMaster)
    .set({ isDefault: false, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
    .where(
      exceptId === undefined
        ? eq(invoiceTemplateMaster.isDefault, true)
        : and(eq(invoiceTemplateMaster.isDefault, true), ne(invoiceTemplateMaster.id, exceptId)),
    );
}
