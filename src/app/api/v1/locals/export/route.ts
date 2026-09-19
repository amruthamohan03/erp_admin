import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { localsT } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { localListQuerySchema } from '@/schemas/locals';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/locals/export?q=&location_filter=
//
// Excel download of the Local Tracking list (§4.25) — the same rows the list
// shows under the same search and location card, every row rather than one page.
// Columns come from the `local` page definition (pageExport.ts), so a field added
// to the form reaches the sheet with no change here.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = localListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    location_filter: searchParams.get('location_filter') ?? undefined,
  });

  // Mirrors listLocals: the module's three offices, the clicked location card,
  // and a search over the reference, truck, transporter, client code and office
  // — an export of a filtered list must hold the rows that list was showing.
  const conds: SQL[] = [inArray(localsT.location, [1, 2, 4])];
  if (q.location_filter > 0) conds.push(eq(localsT.location, q.location_filter));
  const term = q.q?.trim();
  if (term) {
    const like = `%${term}%`;
    conds.push(
      or(
        ilike(localsT.mcaLtReference, like),
        ilike(localsT.lotNum, like),
        ilike(localsT.horse, like),
        ilike(localsT.trailer1, like),
        ilike(localsT.trailer2, like),
        ilike(localsT.transporter, like),
        sql`${localsT.clientId} IN (SELECT id FROM client_master_t WHERE short_name ILIKE ${like} OR company_name ILIKE ${like})`,
        sql`${localsT.location} IN (SELECT id FROM main_office_master_t WHERE main_location_name ILIKE ${like})`,
      ) as SQL,
    );
  }

  const sheet = await buildPageExportSheet('local', { where: and(...conds), sheetName: 'Local Tracking' });

  // §4.28 — an export is a logged action, with the filter it ran under.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'local',
    entityId: 'list',
    module: 'local',
    after: { rows: sheet.rows.length, filter: term || null, location: q.location_filter || null },
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `local-tracking-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
