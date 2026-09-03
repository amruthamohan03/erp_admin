import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, licenseT } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';

// GET /api/v1/licenses/{id}/usage
//
// Returns how much of a license's FOB cap has been consumed by
// its live exports + imports, plus what's left. Powers the
// /exports/bulk-new grid header ("Available: $X") and can back a
// similar imports/bulk-new page later.
//
// amount is the license's declared FOB ceiling; null amount means
// no cap. remaining_fob is null in that case (UI shows an "∞"
// hint instead of a number).

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const licenseId = parseInt(idStr, 10);
    if (!Number.isInteger(licenseId) || licenseId <= 0) {
      throw new BadRequestError('Invalid id');
    }

    // The master ids AND their labels come back together: the create header
    // shows the codes read-only, and the same ids are what it submits, so a
    // second round trip to name them would be the caller re-deriving what this
    // query already had in hand (§4.10).
    const [lic] = await db
      .select({
        id: licenseT.id,
        license_no: licenseT.licenseNumber,
        // FOB ceiling — main's licenses model tracks the declared FOB here.
        amount: licenseT.fobDeclared,
        client_id: licenseT.clientId,
        state: licenseT.status,
        weight: licenseT.weight,
        supplier: licenseT.supplier,
        kind_id: licenseT.kindId,
        kind_name: sql<string | null>`(SELECT kind_name FROM kind_master_t k WHERE k.id = ${licenseT.kindId})`,
        type_of_goods_id: licenseT.typeOfGoodsId,
        type_of_goods_name: sql<string | null>`(SELECT goods_type FROM type_of_goods_master_t g WHERE g.id = ${licenseT.typeOfGoodsId})`,
        transport_mode_id: licenseT.transportModeId,
        transport_mode_name: sql<string | null>`(SELECT transport_mode_name FROM transport_mode_master_t t WHERE t.id = ${licenseT.transportModeId})`,
        currency_id: licenseT.currencyId,
        currency_name: sql<string | null>`(SELECT currency_name FROM currency_master_t c WHERE c.id = ${licenseT.currencyId})`,
      })
      .from(licenseT)
      .where(eq(licenseT.id, licenseId))
      .limit(1);
    if (!lic) throw new NotFoundError('License not found');

    const [expUsed] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${exportT.fob}), 0)`.as('total'),
      })
      .from(exportT)
      .where(
        and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')),
      );
    const [impUsed] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${importT.fob}), 0)`.as('total'),
      })
      .from(importT)
      .where(
        and(eq(importT.licenseId, licenseId), eq(importT.display, 'Y')),
      );

    // Weight is capped the same way FOB is, and the create header shows both —
    // an operator sizing a batch needs to know which ceiling they are near.
    const [expWeight] = await db
      .select({ total: sql<string>`COALESCE(SUM(${exportT.weight}), 0)`.as('total') })
      .from(exportT)
      .where(and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')));
    const [impWeight] = await db
      .select({ total: sql<string>`COALESCE(SUM(${importT.weight}), 0)`.as('total') })
      .from(importT)
      .where(and(eq(importT.licenseId, licenseId), eq(importT.display, 'Y')));

    const capNum = lic.amount == null ? null : Number(lic.amount);
    const usedExports = Number(expUsed?.total ?? 0);
    const usedImports = Number(impUsed?.total ?? 0);
    const used = usedExports + usedImports;
    const remaining = capNum == null ? null : Math.max(0, capNum - used);

    const weightCap = lic.weight == null ? null : Number(lic.weight);
    const usedWeight = Number(expWeight?.total ?? 0) + Number(impWeight?.total ?? 0);
    const remainingWeight = weightCap == null ? null : Math.max(0, weightCap - usedWeight);

    return ok({
      license_id: lic.id,
      license_no: lic.license_no,
      client_id: lic.client_id,
      state: lic.state,
      amount: capNum,
      used_fob_exports: usedExports,
      used_fob_imports: usedImports,
      used_fob_total: used,
      remaining_fob: remaining,
      weight: weightCap,
      used_weight_total: usedWeight,
      remaining_weight: remainingWeight,
      // Copied onto every export in the batch, and shown read-only in the header
      // so the operator can see what the licence is committing them to.
      buyer: lic.supplier,
      kind_id: lic.kind_id,
      kind_name: lic.kind_name,
      type_of_goods_id: lic.type_of_goods_id,
      type_of_goods_name: lic.type_of_goods_name,
      transport_mode_id: lic.transport_mode_id,
      transport_mode_name: lic.transport_mode_name,
      currency_id: lic.currency_id,
      currency_name: lic.currency_name,
    });
  },
);
