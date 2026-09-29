import { NextRequest } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceGridHeadingMaster } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadGridHeadings } from '@/db/queries/invoiceGridHeadings';
import { isColumnOf } from '@/lib/invoiceGrid/columns';
import { invoiceGridHeadingQuerySchema, invoiceGridHeadingSaveSchema } from '@/schemas';

// The invoice grid's column headings (§4.1).
//
// GET returns every grid's resolved headings in one object — the editable grid
// draws two of the three sets on a single invoice, so fetching them separately
// would be two requests for one screen.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = invoiceGridHeadingQuerySchema.parse({
    category_id: searchParams.get('category_id') ?? undefined,
  });

  return ok(await loadGridHeadings(q.category_id ?? null));
});

/**
 * Save one grid's whole header line.
 *
 * Upserts rather than replaces, in ONE transaction: a partial save would leave
 * a grid with some columns renamed and some not, which reads as a bug in the
 * screen rather than as a failed save.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = invoiceGridHeadingSaveSchema.parse(await req.json());
  const categoryId = data.category_id ?? null;

  // A column key names a field the renderer reads, so an unknown one is
  // refused by name rather than stored as a heading over nothing (§4.23).
  const unknown = data.headings
    .map((h) => h.column_key)
    .filter((k) => !isColumnOf(data.grid_key, k));
  if (unknown.length > 0) {
    return fail(
      `The ${data.grid_key} grid has no column called ${unknown.map((k) => `“${k}”`).join(', ')}.`,
      422,
      { field: 'headings', code: 'unknown_column' },
    );
  }

  await db.transaction(async (tx) => {
    for (const h of data.headings) {
      const scope = and(
        eq(invoiceGridHeadingMaster.gridKey, data.grid_key),
        eq(invoiceGridHeadingMaster.columnKey, h.column_key),
        categoryId === null
          ? isNull(invoiceGridHeadingMaster.categoryId)
          : eq(invoiceGridHeadingMaster.categoryId, categoryId),
      );

      const [existing] = await tx
        .select({ id: invoiceGridHeadingMaster.id })
        .from(invoiceGridHeadingMaster)
        .where(and(scope, eq(invoiceGridHeadingMaster.display, 'Y')))
        .limit(1);

      // A cleared heading removes the row rather than storing an empty string:
      // "no row" is what the resolver already reads as "use the built-in", so
      // there is one representation of that state instead of two.
      if (!h.heading) {
        if (existing) {
          await tx
            .update(invoiceGridHeadingMaster)
            .set({
              display: 'N',
              updatedBy: session.uid,
              updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
            })
            .where(eq(invoiceGridHeadingMaster.id, existing.id));
        }
        continue;
      }

      if (existing) {
        await tx
          .update(invoiceGridHeadingMaster)
          .set({
            heading: h.heading,
            updatedBy: session.uid,
            updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
          })
          .where(eq(invoiceGridHeadingMaster.id, existing.id));
      } else {
        await tx.insert(invoiceGridHeadingMaster).values({
          gridKey: data.grid_key,
          columnKey: h.column_key,
          categoryId,
          heading: h.heading,
          createdBy: session.uid,
          updatedBy: session.uid,
        });
      }
    }
  });

  return ok(await loadGridHeadings(categoryId));
});
