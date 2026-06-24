import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster, licenseTypeMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { licenseListQuerySchema } from '@/app/api/v1/licenses/route';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/licenses/export
// Filtered XLSX download of the licenses list. Honours the same
// query params as GET /api/v1/licenses (q, client_id, state) so an
// operator can scope the export to the view they're looking at.
//
// No pagination — exports the entire matched set.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = licenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    page: '1',
    pageSize: '100',
  });

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
    .where(where)
    .orderBy(desc(licenseT.id));

  const buf = await buildXlsx([
    {
      name: 'Licenses',
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

  const res = xlsxResponse(buf, `licenses-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  });
});
