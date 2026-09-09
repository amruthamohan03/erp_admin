import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  importT,
  exportT,
  quotations,
  licenseT,
  clientMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/dashboard/recent-activity
// Returns the 5 most recently created rows across the four
// transactional entities (imports, exports, quotations, licenses)
// with client names joined for display. Powers the "Recent activity"
// widget on /dashboard — one HTTP round-trip for the whole feed.
//
// Sort by created_at DESC (not the business date) so operators see
// the freshest data entry, not the freshest business event. Both
// answers are defensible; created_at wins because it's always set.

const LIMIT = 5;

// §4.15 — the Client column is the short code in every one of the four feeds
// below. This is a table of consignments, not of clients: the row is identified
// by its own reference, and the client is the code operators quote beside it.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const [imports, exports_, quotationsRows, licenses] = await Promise.all([
    db
      .select({
        id: importT.id,
        ref: importT.mcaRef,
        client_name: clientMaster.shortName,
        date: importT.createdAt,
        amount: importT.fob,
      })
      .from(importT)
      .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
      .where(eq(importT.display, 'Y'))
      .orderBy(desc(importT.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: exportT.id,
        ref: exportT.mcaRef,
        client_name: clientMaster.shortName,
        date: exportT.createdAt,
        amount: exportT.fob,
      })
      .from(exportT)
      .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
      .where(eq(exportT.display, 'Y'))
      .orderBy(desc(exportT.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: quotations.id,
        ref: quotations.quotationRef,
        client_name: clientMaster.shortName,
        date: quotations.createdAt,
        amount: quotations.totalAmount,
      })
      .from(quotations)
      .leftJoin(clientMaster, eq(clientMaster.id, quotations.clientId))
      .where(eq(quotations.display, 'Y'))
      .orderBy(desc(quotations.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: licenseT.id,
        ref: licenseT.licenseNumber,
        client_name: clientMaster.shortName,
        date: licenseT.createdAt,
        amount: licenseT.fobDeclared,
        state: licenseT.status,
      })
      .from(licenseT)
      .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
      .where(eq(licenseT.display, 'Y'))
      .orderBy(desc(licenseT.createdAt))
      .limit(LIMIT),
  ]);

  return ok({
    imports,
    exports: exports_,
    quotations: quotationsRows,
    licenses,
  });
});
