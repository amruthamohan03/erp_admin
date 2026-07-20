import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError } from '@/lib/errors';
import { clientCreateSchema, clientListQuerySchema } from '@/schemas';
import { createBodyToInsert } from '@/lib/clients/serialize';
import type { ClientMasterInsert } from '@/db/schema';

// GET /api/v1/clients?q=&page=&pageSize=
// Paginated list of active clients. Search hits
// client_code/name/legal_name/email/tax_id. Returns the summary column
// set (list-view fields only); the /[id] endpoint returns the full
// row including regulatory numbers + FKs.

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
      client_type: clientMaster.clientType,
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
// Accepts the full extended field set (contact + regulatory +
// payment blocks). Only client_code + name are required; everything
// else is nullable so a partial onboarding still lands a row.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = clientCreateSchema.parse(await req.json());

  try {
    const [row] = await db
      .insert(clientMaster)
      .values({
        ...(createBodyToInsert(data) as ClientMasterInsert),
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: clientMaster.id,
        client_code: clientMaster.clientCode,
        name: clientMaster.name,
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
