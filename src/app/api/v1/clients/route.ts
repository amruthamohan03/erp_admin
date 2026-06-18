import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError } from '@/lib/errors';
import { clientCreateSchema, clientListQuerySchema } from '@/schemas';

// GET /api/v1/clients?q=&page=&pageSize=
// Paginated list of active clients. Search hits client_code/name/
// legal_name/email/tax_id. Returns { items, meta: { total, page, pageSize } }.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clientListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(clientMaster.display, 'Y'),
        or(
          ilike(clientMaster.clientCode, like),
          ilike(clientMaster.name, like),
          ilike(clientMaster.legalName, like),
          ilike(clientMaster.email, like),
          ilike(clientMaster.taxId, like),
        ),
      )
    : eq(clientMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(clientMaster)
    .where(where);

  const items = await db
    .select({
      id: clientMaster.id,
      client_code: clientMaster.clientCode,
      name: clientMaster.name,
      legal_name: clientMaster.legalName,
      email: clientMaster.email,
      phone: clientMaster.phone,
      address: clientMaster.address,
      tax_id: clientMaster.taxId,
      display: clientMaster.display,
      created_at: clientMaster.createdAt,
      updated_at: clientMaster.updatedAt,
    })
    .from(clientMaster)
    .where(where)
    .orderBy(desc(clientMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

// POST /api/v1/clients
// Create a client. client_code is unique — duplicate returns 409.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = clientCreateSchema.parse(await req.json());

  try {
    const [row] = await db
      .insert(clientMaster)
      .values({
        clientCode: data.client_code,
        name: data.name,
        legalName: data.legal_name ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        taxId: data.tax_id ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: clientMaster.id,
        client_code: clientMaster.clientCode,
        name: clientMaster.name,
        legal_name: clientMaster.legalName,
        email: clientMaster.email,
        phone: clientMaster.phone,
        address: clientMaster.address,
        tax_id: clientMaster.taxId,
        display: clientMaster.display,
        created_at: clientMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      throw new ConflictError('client_code already exists');
    }
    throw new BadRequestError('Failed to create client');
  }
});
