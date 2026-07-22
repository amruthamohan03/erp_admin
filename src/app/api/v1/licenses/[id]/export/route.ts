import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster } from '@/db/schema';
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
        license_number: licenseT.licenseNumber,
        status: licenseT.status,
        client_code: clientMaster.shortName,
        client_name: clientMaster.companyName,
        supplier: licenseT.supplier,
        invoice_number: licenseT.invoiceNumber,
        fob_declared: licenseT.fobDeclared,
        applied_date: licenseT.licenseAppliedDate,
        validation_date: licenseT.licenseValidationDate,
        expiry_date: licenseT.licenseExpiryDate,
        created_at: licenseT.createdAt,
      })
      .from(licenseT)
      .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
      .where(eq(licenseT.id, id))
      .orderBy(desc(licenseT.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('License not found');

    const buf = await buildXlsx([
      {
        name: 'License',
        columns: [
          { key: 'id', header: 'ID', width: 6 },
          { key: 'license_number', header: 'License #', width: 18 },
          { key: 'status', header: 'Status', width: 14 },
          { key: 'client_code', header: 'Client Code', width: 14 },
          { key: 'client_name', header: 'Client', width: 28 },
          { key: 'supplier', header: 'Supplier', width: 24 },
          { key: 'invoice_number', header: 'Invoice #', width: 16 },
          { key: 'fob_declared', header: 'FOB Declared', width: 14 },
          { key: 'applied_date', header: 'Applied', width: 12 },
          { key: 'validation_date', header: 'Validated', width: 12 },
          { key: 'expiry_date', header: 'Expires', width: 12 },
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
