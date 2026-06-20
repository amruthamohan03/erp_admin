import { NextRequest } from 'next/server';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  quotations,
  quotationItems,
  clientMaster,
  kindMaster,
  quotationCategoryMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildQuotation } from '@/lib/quotations/compute';
import {
  quotationBodySchema,
  quotationListQuerySchema,
} from '@/schemas/quotations';

// GET /api/v1/quotations?q=&client_id=&kind_id=&page=&pageSize=
// Paginated list joined with client name + kind short name for display.
// Search hits quotation_ref and the joined client name (ILIKE).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = quotationListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    kind_id: searchParams.get('kind_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(quotations.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(quotations.quotationRef, like),
      ilike(clientMaster.name, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(quotations.clientId, q.client_id));
  if (q.kind_id) conds.push(eq(quotations.kindId, q.kind_id));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(quotations)
    .leftJoin(clientMaster, eq(clientMaster.id, quotations.clientId))
    .where(where);

  const items = await db
    .select({
      id: quotations.id,
      quotation_ref: quotations.quotationRef,
      quotation_date: quotations.quotationDate,
      client_id: quotations.clientId,
      client_name: clientMaster.name,
      kind_id: quotations.kindId,
      kind_name: kindMaster.kindName,
      arsp: quotations.arsp,
      sub_total: quotations.subTotal,
      vat_amount: quotations.vatAmount,
      arsp_amount: quotations.arspAmount,
      total_amount: quotations.totalAmount,
      sub_total_cdf: quotations.subTotalCdf,
      vat_amount_cdf: quotations.vatAmountCdf,
      total_amount_cdf: quotations.totalAmountCdf,
      display: quotations.display,
      created_at: quotations.createdAt,
      updated_at: quotations.updatedAt,
    })
    .from(quotations)
    .leftJoin(clientMaster, eq(clientMaster.id, quotations.clientId))
    .leftJoin(kindMaster, eq(kindMaster.id, quotations.kindId))
    .where(where)
    .orderBy(desc(quotations.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

// POST /api/v1/quotations
// Create a quotation. Server-side compute via buildQuotation —
// client-supplied totals are recomputed, never trusted. Header + items
// + audit row land in one transaction so partial state is impossible.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = quotationBodySchema.parse(await req.json());

  // Resolve kind name (drives compute path detection). Optional — null
  // kind falls through to the default qty × taux behavior.
  let kindName = '';
  if (body.kind_id) {
    const [kind] = await db
      .select({ kindName: kindMaster.kindName })
      .from(kindMaster)
      .where(eq(kindMaster.id, body.kind_id))
      .limit(1);
    if (!kind) throw new BadRequestError('Invalid kind_id');
    kindName = kind.kindName;
  }

  // Customs-flagged categories for the CDF path detection. Load all of
  // them in one query rather than per-line lookups.
  const customsRows = await db
    .select({ id: quotationCategoryMaster.id })
    .from(quotationCategoryMaster)
    .where(eq(quotationCategoryMaster.isCustoms, true));
  const customsByCat = new Map<number, boolean>(
    customsRows.map((r) => [r.id, true]),
  );

  const { header, items } = buildQuotation(body, kindName, customsByCat);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(quotations)
      .values({
        ...header,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: quotations.id });

    if (items.length > 0) {
      await tx.insert(quotationItems).values(
        items.map((it) => ({
          ...it,
          quotationId: row.id,
          createdBy: session.uid,
          updatedBy: session.uid,
        })),
      );
    }

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'quotation',
      entityId: String(row.id),
      after: { header, item_count: items.length },
    });

    return row.id;
  });

  return ok({ id }, 201);
});
