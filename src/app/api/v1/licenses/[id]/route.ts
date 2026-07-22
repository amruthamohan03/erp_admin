import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  licenseT,
  clientMaster,
  kindMaster,
  banklistMaster,
  transportModeMaster,
  typeOfGoodsMaster,
  currencyMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/licenses/{id}
// Single-license fetch — the full license_t row plus the joined display
// names (client / kind / bank / transport / type-of-goods / currency),
// mirroring the join set the list route exposes.

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .select({
      id: licenseT.id,
      license_number: licenseT.licenseNumber,
      bank_id: licenseT.bankId,
      bank_name: banklistMaster.bankName,
      client_id: licenseT.clientId,
      client_name: clientMaster.companyName,
      license_cleared_by: licenseT.licenseClearedBy,
      entry_post_id: licenseT.entryPostId,
      ref_cod: licenseT.refCod,
      type_of_goods_id: licenseT.typeOfGoodsId,
      type_of_goods_name: typeOfGoodsMaster.goodsType,
      weight: licenseT.weight,
      m3: licenseT.m3,
      unit_of_measurement_id: licenseT.unitOfMeasurementId,
      fob_declared: licenseT.fobDeclared,
      insurance: licenseT.insurance,
      freight: licenseT.freight,
      other_costs: licenseT.otherCosts,
      transport_mode_id: licenseT.transportModeId,
      transport_mode_name: transportModeMaster.transportModeName,
      invoice_number: licenseT.invoiceNumber,
      invoice_file: licenseT.invoiceFile,
      invoice_date: licenseT.invoiceDate,
      currency_id: licenseT.currencyId,
      currency_name: currencyMaster.currencyName,
      supplier: licenseT.supplier,
      license_applied_date: licenseT.licenseAppliedDate,
      license_validation_date: licenseT.licenseValidationDate,
      license_expiry_date: licenseT.licenseExpiryDate,
      license_file: licenseT.licenseFile,
      kind_id: licenseT.kindId,
      kind_name: kindMaster.kindName,
      payment_method_id: licenseT.paymentMethodId,
      payment_subtype_id: licenseT.paymentSubtypeId,
      destination_id: licenseT.destinationId,
      fsi: licenseT.fsi,
      aur: licenseT.aur,
      status: licenseT.status,
      fob_currency_id: licenseT.fobCurrencyId,
      insurance_currency_id: licenseT.insuranceCurrencyId,
      freight_currency_id: licenseT.freightCurrencyId,
      other_costs_currency_id: licenseT.otherCostsCurrencyId,
      display: licenseT.display,
      created_at: licenseT.createdAt,
      updated_at: licenseT.updatedAt,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(kindMaster, eq(kindMaster.id, licenseT.kindId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenseT.bankId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, licenseT.transportModeId))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenseT.typeOfGoodsId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, licenseT.currencyId))
    .where(eq(licenseT.id, id))
    .limit(1);

  if (!row) throw new NotFoundError('License not found');
  return ok(row);
});
