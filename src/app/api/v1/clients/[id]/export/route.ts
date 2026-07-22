import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/clients/{id}/export
// XLSX download of a single client row — same column shape as the
// list export.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const rows = await db
      .select({
        id: clientMaster.id,
        short_name: clientMaster.shortName,
        company_name: clientMaster.companyName,
        client_type: clientMaster.clientType,
        contact_person: clientMaster.contactPerson,
        email: clientMaster.email,
        phone: clientMaster.phone,
        address: clientMaster.address,
        created_at: clientMaster.createdAt,
      })
      .from(clientMaster)
      .where(eq(clientMaster.id, id))
      .orderBy(desc(clientMaster.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Client not found');

    const buf = await buildXlsx([
      {
        name: 'Client',
        columns: [
          { key: 'id', header: 'ID', width: 6 },
          { key: 'short_name', header: 'Code', width: 14 },
          { key: 'company_name', header: 'Company Name', width: 32 },
          { key: 'client_type', header: 'Type', width: 10 },
          { key: 'contact_person', header: 'Contact Person', width: 24 },
          { key: 'email', header: 'Email', width: 28 },
          { key: 'phone', header: 'Phone', width: 16 },
          { key: 'address', header: 'Address', width: 40 },
          { key: 'created_at', header: 'Created', width: 18 },
        ],
        rows,
      },
    ]);

    const res = xlsxResponse(buf, `client-${id}-${dateStamp()}.xlsx`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  },
);
