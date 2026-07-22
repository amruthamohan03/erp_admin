import { NextRequest } from 'next/server';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exportT,
  clientMaster,
  licenseT,
  clearingStatusMaster,
  documentStatusMaster,
  regimeMaster,
  truckStatusMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  exportBodySchema,
  exportListQuerySchema,
} from '@/schemas/exports';
import { bodyToInsert } from '@/lib/exports/serialize';

// GET /api/v1/exports — paginated list with display joins:
// client, license, regime, clearing-status, document-status,
// truck-status. Search hits mca_ref / invoice / buyer / client name.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = exportListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    license_id: searchParams.get('license_id') ?? undefined,
    clearing_status_id: searchParams.get('clearing_status_id') ?? undefined,
    document_status_id: searchParams.get('document_status_id') ?? undefined,
    regime_id: searchParams.get('regime_id') ?? undefined,
    transport_mode_id: searchParams.get('transport_mode_id') ?? undefined,
    truck_status_id: searchParams.get('truck_status_id') ?? undefined,
    loading_from: searchParams.get('loading_from') ?? undefined,
    loading_to: searchParams.get('loading_to') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(exportT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(exportT.mcaRef, like),
      ilike(exportT.invoice, like),
      ilike(exportT.buyer, like),
      ilike(clientMaster.companyName, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(exportT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(exportT.licenseId, q.license_id));
  if (q.clearing_status_id) {
    conds.push(eq(exportT.clearingStatus, q.clearing_status_id));
  }
  if (q.document_status_id) {
    conds.push(eq(exportT.documentStatus, q.document_status_id));
  }
  if (q.regime_id) conds.push(eq(exportT.regime, q.regime_id));
  if (q.transport_mode_id) {
    conds.push(eq(exportT.transportMode, q.transport_mode_id));
  }
  if (q.truck_status_id) {
    conds.push(eq(exportT.truckStatus, q.truck_status_id));
  }
  if (q.loading_from) conds.push(gte(exportT.loadingDate, q.loading_from));
  if (q.loading_to) conds.push(lte(exportT.loadingDate, q.loading_to));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(exportT)
    .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
    .where(where);

  const items = await db
    .select({
      id: exportT.id,
      mca_ref: exportT.mcaRef,
      invoice: exportT.invoice,
      buyer: exportT.buyer,
      loading_date: exportT.loadingDate,
      client_id: exportT.clientId,
      client_name: clientMaster.companyName,
      license_id: exportT.licenseId,
      license_no: licenseT.licenseNumber,
      // Alias exposed for parity with main's list, which renders the
      // license under the `license_number` key.
      license_number: licenseT.licenseNumber,
      regime_id: exportT.regime,
      regime_name: regimeMaster.regimeName,
      clearing_status_id: exportT.clearingStatus,
      clearing_status_name: clearingStatusMaster.clearingStatus,
      document_status_id: exportT.documentStatus,
      document_status_name: documentStatusMaster.documentStatus,
      truck_status_id: exportT.truckStatus,
      truck_status_name: truckStatusMaster.truckStatus,
      fob: exportT.fob,
      weight: exportT.weight,
      destination: exportT.destination,
      display: exportT.display,
      created_at: exportT.createdAt,
      updated_at: exportT.updatedAt,
    })
    .from(exportT)
    .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
    .leftJoin(licenseT, eq(licenseT.id, exportT.licenseId))
    .leftJoin(regimeMaster, eq(regimeMaster.id, exportT.regime))
    .leftJoin(
      clearingStatusMaster,
      eq(clearingStatusMaster.id, exportT.clearingStatus),
    )
    .leftJoin(
      documentStatusMaster,
      eq(documentStatusMaster.id, exportT.documentStatus),
    )
    .leftJoin(
      truckStatusMaster,
      eq(truckStatusMaster.id, exportT.truckStatus),
    )
    .where(where)
    .orderBy(desc(exportT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

// POST /api/v1/exports — create. Audit recorded in-transaction.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = exportBodySchema.parse(await req.json());

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(exportT)
      .values({
        ...bodyToInsert(body),
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: exportT.id });

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'export',
      entityId: String(row.id),
      after: body,
    });

    return row.id;
  });

  return ok({ id }, 201);
});
