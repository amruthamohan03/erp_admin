import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importT, exportT, licenseT } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { importsBulkCreateSchema } from '@/schemas/imports-bulk';

// POST /api/v1/imports/bulk-create
//
// Sibling of /api/v1/exports/bulk-create. Same shape: N rows
// against ONE license in a single transaction, FOB cap enforced
// (license.amount − SUM(fob) of BOTH live exports and live
// imports on the same license — a shared cap), MCA refs generated
// as `{prefix}-NNNN`, all-or-nothing on any collision.

const num = (v: number | undefined): string | null =>
  v === undefined ? null : String(v);
const norm = (v: string | null | undefined): string | null =>
  v && v.trim() !== '' ? v.trim() : null;

interface LicenseFacts {
  id: number;
  amount: string | null;
  clientId: number;
  used: number;
}

async function loadLicenseFacts(
  licenseId: number,
): Promise<LicenseFacts | null> {
  const [lic] = await db
    .select({
      id: licenseT.id,
      amount: licenseT.amount,
      clientId: licenseT.clientId,
    })
    .from(licenseT)
    .where(eq(licenseT.id, licenseId))
    .limit(1);
  if (!lic) return null;

  // Shared FOB pool across imports + exports — license capacity
  // has to reflect BOTH sides, otherwise an operator could
  // exhaust the cap by bulk-inserting imports without the export
  // side seeing it.
  const [impUsed] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${importT.fob}), 0)`.as('total'),
    })
    .from(importT)
    .where(and(eq(importT.licenseId, licenseId), eq(importT.display, 'Y')));
  const [expUsed] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${exportT.fob}), 0)`.as('total'),
    })
    .from(exportT)
    .where(and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')));

  const used = Number(impUsed?.total ?? 0) + Number(expUsed?.total ?? 0);
  return { ...lic, used };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { common, rows } = importsBulkCreateSchema.parse(await req.json());

  const lic = await loadLicenseFacts(common.license_id);
  if (!lic) throw new NotFoundError('License not found');
  if (lic.clientId !== common.client_id) {
    throw new BadRequestError(
      'License does not belong to the selected client',
    );
  }

  if (lic.amount != null) {
    const cap = Number(lic.amount);
    const requested = rows.reduce((s, r) => s + Number(r.fob ?? 0), 0);
    const remaining = cap - lic.used;
    if (requested > remaining) {
      throw new BadRequestError(
        `Batch FOB (${requested.toFixed(2)}) exceeds remaining license ` +
          `capacity (${remaining.toFixed(2)} = cap ${cap.toFixed(2)} − ` +
          `used ${lic.used.toFixed(2)}).`,
      );
    }
  }

  const prefix = common.mca_ref_prefix.trim();
  if (!prefix) throw new BadRequestError('mca_ref_prefix required');

  const createdIds = await db.transaction(async (tx) => {
    const ids: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const mcaRef = `${prefix}-${String(i + 1).padStart(4, '0')}`;

      const [dup] = await tx
        .select({ id: importT.id })
        .from(importT)
        .where(and(eq(importT.mcaRef, mcaRef), eq(importT.display, 'Y')))
        .limit(1);
      if (dup) {
        throw new ConflictError(
          `MCA ref "${mcaRef}" already exists — pick a different prefix or ` +
            `resolve the existing row.`,
        );
      }

      const values = {
        clientId: common.client_id,
        licenseId: common.license_id,
        mcaRef,
        kindId: common.kind_id ?? null,
        transportModeId: common.transport_mode_id ?? null,
        typeOfGoodsId: common.type_of_goods_id ?? null,
        regimeId: common.regime_id ?? null,
        typesOfClearanceId: common.types_of_clearance_id ?? null,
        currencyId: common.currency_id ?? null,
        declarationOfficeId: common.declaration_office_id ?? null,
        supplier: norm(r.supplier),
        preAlertDate: r.pre_alert_date ?? null,
        invoice: norm(r.invoice),
        poRef: norm(r.po_ref),
        weight: num(r.weight),
        fob: num(r.fob),
        roadManif: norm(r.road_manif),
        airwayBill: norm(r.airway_bill),
        container: norm(r.container),
        horse: norm(r.horse),
        trailer1: norm(r.trailer_1),
        trailer2: norm(r.trailer_2),
        entryPointId: r.entry_point_id ?? null,
        commodityId: r.commodity_id ?? null,
        hscodeId: r.hscode_id ?? null,
        incotermId: r.incoterm_id ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      };

      const [inserted] = await tx
        .insert(importT)
        .values(values)
        .returning({ id: importT.id });
      ids.push(inserted.id);

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: 'import',
        entityId: String(inserted.id),
        after: values,
        metadata: { source: 'bulk-create', mca_ref: mcaRef },
      });
    }
    return ids;
  });

  return ok({ created: createdIds.length, ids: createdIds }, { status: 201 });
});
