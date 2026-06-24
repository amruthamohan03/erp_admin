import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { clientListQuerySchema } from '@/schemas';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/clients/export
// Filtered XLSX download of the clients list — same `q` filter as
// the list GET. No pagination.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clientListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: '1',
    pageSize: '100',
  });

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

  const rows = await db
    .select({
      id: clientMaster.id,
      client_code: clientMaster.clientCode,
      name: clientMaster.name,
      legal_name: clientMaster.legalName,
      email: clientMaster.email,
      phone: clientMaster.phone,
      address: clientMaster.address,
      tax_id: clientMaster.taxId,
      created_at: clientMaster.createdAt,
    })
    .from(clientMaster)
    .where(where)
    .orderBy(desc(clientMaster.id));

  const buf = await buildXlsx([
    {
      name: 'Clients',
      columns: [
        { key: 'id', header: 'ID', width: 6 },
        { key: 'client_code', header: 'Code', width: 14 },
        { key: 'name', header: 'Name', width: 28 },
        { key: 'legal_name', header: 'Legal Name', width: 32 },
        { key: 'email', header: 'Email', width: 28 },
        { key: 'phone', header: 'Phone', width: 16 },
        { key: 'address', header: 'Address', width: 40 },
        { key: 'tax_id', header: 'Tax ID', width: 16 },
        { key: 'created_at', header: 'Created', width: 18 },
      ],
      rows,
    },
  ]);

  const res = xlsxResponse(buf, `clients-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
