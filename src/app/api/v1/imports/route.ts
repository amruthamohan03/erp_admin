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
  importT,
  clientMaster,
  licenseT,
  clearingStatusMaster,
  documentStatusMaster,
  regimeMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  importBodySchema,
  importListQuerySchema,
} from '@/schemas/imports';
import { bodyToInsert } from '@/lib/imports/serialize';

// GET /api/v1/imports?q=&client_id=&license_id=&clearing_status_id=&
//                   document_status_id=&regime_id=&pre_alert_from=&
//                   pre_alert_to=&page=&pageSize=
//
// Paginated list with the joins the imports table view needs:
// client name, license ref, clearing-status name, document-status name,
// regime name. Search hits mca_ref, invoice number, supplier, and the
// joined client name (ILIKE — server-side so the page is paged at the
// DB rather than client-side).
//
// Soft-deleted rows (display='N') are hidden by default.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = importListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    license_id: searchParams.get('license_id') ?? undefined,
    clearing_status_id: searchParams.get('clearing_status_id') ?? undefined,
    document_status_id: searchParams.get('document_status_id') ?? undefined,
    regime_id: searchParams.get('regime_id') ?? undefined,
    pre_alert_from: searchParams.get('pre_alert_from') ?? undefined,
    pre_alert_to: searchParams.get('pre_alert_to') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(importT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(importT.mcaRef, like),
      ilike(importT.invoice, like),
      ilike(importT.supplier, like),
      ilike(clientMaster.name, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(importT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(importT.licenseId, q.license_id));
  if (q.clearing_status_id) {
    conds.push(eq(importT.clearingStatusId, q.clearing_status_id));
  }
  if (q.document_status_id) {
    conds.push(eq(importT.documentStatusId, q.document_status_id));
  }
  if (q.regime_id) conds.push(eq(importT.regimeId, q.regime_id));
  if (q.pre_alert_from) {
    conds.push(gte(importT.preAlertDate, q.pre_alert_from));
  }
  if (q.pre_alert_to) {
    conds.push(lte(importT.preAlertDate, q.pre_alert_to));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .where(where);

  const items = await db
    .select({
      id: importT.id,
      mca_ref: importT.mcaRef,
      invoice: importT.invoice,
      supplier: importT.supplier,
      pre_alert_date: importT.preAlertDate,
      client_id: importT.clientId,
      client_name: clientMaster.name,
      license_id: importT.licenseId,
      license_no: licenseT.licenseNo,
      regime_id: importT.regimeId,
      regime_name: regimeMaster.regimeName,
      clearing_status_id: importT.clearingStatusId,
      clearing_status_name: clearingStatusMaster.clearingStatus,
      document_status_id: importT.documentStatusId,
      document_status_name: documentStatusMaster.documentStatus,
      fob: importT.fob,
      weight: importT.weight,
      display: importT.display,
      created_at: importT.createdAt,
      updated_at: importT.updatedAt,
    })
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .leftJoin(licenseT, eq(licenseT.id, importT.licenseId))
    .leftJoin(regimeMaster, eq(regimeMaster.id, importT.regimeId))
    .leftJoin(
      clearingStatusMaster,
      eq(clearingStatusMaster.id, importT.clearingStatusId),
    )
    .leftJoin(
      documentStatusMaster,
      eq(documentStatusMaster.id, importT.documentStatusId),
    )
    .where(where)
    .orderBy(desc(importT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

// POST /api/v1/imports
// Creates a new import row. Audit is recorded in-transaction so a
// rollback drops both the row and its audit entry together.
//
// `inv_export_disabled` is the only client-controllable boolean and
// defaults to `false` at the DB. Server-side `display='Y'` and the
// audit columns are stamped from the session — never trusted from the
// body.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = importBodySchema.parse(await req.json());

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(importT)
      .values({
        ...bodyToInsert(body),
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: importT.id });

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'import',
      entityId: String(row.id),
      after: body,
    });

    return row.id;
  });

  return ok({ id }, 201);
});
