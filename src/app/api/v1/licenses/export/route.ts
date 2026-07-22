import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { licenseListQuerySchema } from '@/app/api/v1/licenses/route';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/licenses/export
// Filtered XLSX download of the licenses list. Honours the same
// query params as GET /api/v1/licenses (q, client_id, status).
//
// No pagination — exports the entire matched set.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = licenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    page: '1',
    pageSize: '100',
  });

  const conds: SQL[] = [eq(licenseT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(licenseT.licenseNumber, like),
      ilike(licenseT.supplier, like),
      ilike(licenseT.invoiceNumber, like),
      ilike(clientMaster.companyName, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(licenseT.clientId, q.client_id));
  if (q.status) conds.push(eq(licenseT.status, q.status));
  const where = and(...conds);

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
    .where(where)
    .orderBy(desc(licenseT.id));

  const buf = await buildXlsx([
    {
      name: 'Licenses',
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

  const res = xlsxResponse(buf, `licenses-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  });
});
