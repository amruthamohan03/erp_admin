import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { licenseListQuerySchema } from '@/app/api/v1/licenses/route';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import {
  effectiveStatusOf,
  licenseCardCondition,
  licenseRowTone,
  licenseStatusCondition,
} from '@/db/queries/licenseFilters';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/licenses/export
//
// Filtered XLSX download of the licenses list, honouring the same query params
// as GET /api/v1/licenses. Columns come from the page definition, so every field
// on the License form is in the file (see pageExport.ts).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  // Every filter the screen can apply, not just three of them. The toolbar
  // button promises "respects active filters", and it used to read only `q`,
  // `client_id` and `status` — so exporting from a list narrowed by card, kind,
  // bank or transport mode silently produced a wider file than the grid showed.
  const q = licenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    card: searchParams.get('card') ?? undefined,
    kind_id: searchParams.get('kind_id') ?? undefined,
    bank_id: searchParams.get('bank_id') ?? undefined,
    transport_mode_id: searchParams.get('transport_mode_id') ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
    page: '1',
    pageSize: '100',
  });

  // `display = 'Y'` is applied by the export builder.
  const conds: SQL[] = [];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const clientIds = db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      // Both names, matching the list's own search (§4.15) — an export of a
      // filtered list must contain the rows that list was showing.
      .where(or(ilike(clientMaster.shortName, like), ilike(clientMaster.companyName, like)));
    const orClause = or(
      ilike(licenseT.licenseNumber, like),
      ilike(licenseT.supplier, like),
      ilike(licenseT.invoiceNumber, like),
      inArray(licenseT.clientId, clientIds),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(licenseT.clientId, q.client_id));
  // Through the shared predicate, so "Status: ACTIVE" means the same thing here
  // as on the screen — ACTIVE-and-in-date, not ACTIVE-whatever-the-date. The
  // plain `eq` this replaced exported lapsed licences as active.
  if (q.status) conds.push(licenseStatusCondition(q.status));
  if (q.kind_id) conds.push(eq(licenseT.kindId, q.kind_id));
  if (q.bank_id) conds.push(eq(licenseT.bankId, q.bank_id));
  if (q.transport_mode_id) conds.push(eq(licenseT.transportModeId, q.transport_mode_id));
  if (q.start_date) conds.push(gte(licenseT.licenseAppliedDate, q.start_date));
  if (q.end_date) conds.push(lte(licenseT.licenseAppliedDate, q.end_date));
  if (q.card) {
    const cardCond = licenseCardCondition(q.card);
    if (cardCond) conds.push(cardCond);
  }

  const sheet = await buildPageExportSheet('license', {
    where: conds.length > 0 ? and(...conds) : undefined,
    sheetName: 'Licenses',
    // §4.29's colour coding, carried into the file: Active green, Expiring
    // within 30 days orange, Expired (and Annulated) red — the same rule the
    // screen uses, from the same function.
    rowTone: licenseRowTone,
    // Status is not a form field, so the page-driven export had no column for
    // it — a licences sheet that never said whether a licence was live. It also
    // has to be the EFFECTIVE status: printing the stored ACTIVE on a row shaded
    // red would have the cell contradicting the colour beside it.
    extraColumns: [
      {
        name: 'status',
        header: 'Status',
        width: 14,
        value: (raw) => effectiveStatusOf(raw),
      },
    ],
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `licenses-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
