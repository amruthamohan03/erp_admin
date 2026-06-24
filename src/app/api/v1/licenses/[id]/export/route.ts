import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster, licenseTypeMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/licenses/{id}/export
// XLSX download of a single license row — same column shape as the
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
        id: licenseT.id,
        license_no: licenseT.licenseNo,
        state: licenseT.state,
        client_code: clientMaster.clientCode,
        client_name: clientMaster.name,
        license_type: licenseTypeMaster.name,
        amount: licenseT.amount,
        currency: licenseT.currency,
        issue_date: licenseT.issueDate,
        expiry_date: licenseT.expiryDate,
        approved_at: licenseT.approvedAt,
        notes: licenseT.notes,
        created_at: licenseT.createdAt,
      })
      .from(licenseT)
      .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
      .leftJoin(
        licenseTypeMaster,
        eq(licenseTypeMaster.id, licenseT.licenseTypeId),
      )
      .where(eq(licenseT.id, id))
      .orderBy(desc(licenseT.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('License not found');

    const buf = await buildXlsx([
      {
        name: 'License',
        columns: [
          { key: 'id', header: 'ID', width: 6 },
          { key: 'license_no', header: 'License #', width: 18 },
          { key: 'state', header: 'State', width: 14 },
          { key: 'client_code', header: 'Client Code', width: 14 },
          { key: 'client_name', header: 'Client', width: 28 },
          { key: 'license_type', header: 'Type', width: 18 },
          { key: 'amount', header: 'Amount', width: 14 },
          { key: 'currency', header: 'CCY', width: 8 },
          { key: 'issue_date', header: 'Issued', width: 12 },
          { key: 'expiry_date', header: 'Expires', width: 12 },
          { key: 'approved_at', header: 'Approved At', width: 18 },
          { key: 'notes', header: 'Notes', width: 40 },
          { key: 'created_at', header: 'Created', width: 18 },
        ],
        rows,
      },
    ]);

    const res = xlsxResponse(buf, `license-${id}-${dateStamp()}.xlsx`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  },
);
