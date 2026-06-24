import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { licenseT, clientMaster, licenseTypeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET-only list endpoint for the licenses entity. Read-only on
// purpose — license writes go through the case-runtime under
// /api/v1/cases/license/... (createCase + advanceCase handle the
// state machine + audit + side effects). This endpoint exists so
// that downstream forms (imports, exports, etc.) can populate a
// licenses picker without reaching into the case-runtime envelope.

const querySchema = z.object({
  q: z.string().optional(),
  client_id: z.coerce.number().int().positive().optional(),
  // Workflow state from the case-runtime license template. No enum
  // check here — the set is workflow-config-driven so anything the
  // template defines is valid; unknown values just return 0 rows.
  state: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});

export { querySchema as licenseListQuerySchema };

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(licenseT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(licenseT.licenseNo, like),
      ilike(clientMaster.name, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(licenseT.clientId, q.client_id));
  if (q.state) conds.push(eq(licenseT.state, q.state));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .where(where);

  const items = await db
    .select({
      id: licenseT.id,
      license_no: licenseT.licenseNo,
      client_id: licenseT.clientId,
      client_name: clientMaster.name,
      license_type_id: licenseT.licenseTypeId,
      license_type_name: licenseTypeMaster.name,
      state: licenseT.state,
      issue_date: licenseT.issueDate,
      expiry_date: licenseT.expiryDate,
      amount: licenseT.amount,
      currency: licenseT.currency,
      display: licenseT.display,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(
      licenseTypeMaster,
      eq(licenseTypeMaster.id, licenseT.licenseTypeId),
    )
    .where(where)
    .orderBy(desc(licenseT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});
