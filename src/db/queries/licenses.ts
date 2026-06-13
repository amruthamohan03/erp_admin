// Reusable license read queries (§7.4). getLicenseDetail() resolves every FK to
// its master's display name and is shared by the JSON detail endpoint (the View
// popup) and the single-license CSV export, so the two never drift.
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  licenses,
  clients,
  banklistMaster,
  kindMaster,
  typeOfGoodsMaster,
  unitMaster,
  currencyMaster,
  transportModeMaster,
  transitPointMaster,
  paymentTypeMaster,
  paymentSubtypeMaster,
  originMaster,
  doneBy,
} from '@/db/schema';

export async function getLicenseDetail(id: number) {
  const [row] = await db
    .select({
      id: licenses.id,
      license_number: licenses.licenseNumber,
      client_name: clients.shortName,
      bank_name: banklistMaster.bankName,
      kind_name: kindMaster.kindName,
      license_cleared_by_name: doneBy.doneByName,
      type_of_goods: typeOfGoodsMaster.goodsType,
      weight: licenses.weight,
      m3: licenses.m3,
      unit_name: unitMaster.unitName,
      currency_name: currencyMaster.currencyName,
      currency_short_name: currencyMaster.currencyShortName,
      fob_declared: licenses.fobDeclared,
      insurance: licenses.insurance,
      freight: licenses.freight,
      other_costs: licenses.otherCosts,
      transport_mode_name: transportModeMaster.transportModeName,
      invoice_number: licenses.invoiceNumber,
      invoice_date: licenses.invoiceDate,
      invoice_file: licenses.invoiceFile,
      supplier: licenses.supplier,
      license_applied_date: licenses.licenseAppliedDate,
      license_validation_date: licenses.licenseValidationDate,
      license_expiry_date: licenses.licenseExpiryDate,
      license_file: licenses.licenseFile,
      fsi: licenses.fsi,
      aur: licenses.aur,
      entry_post_name: transitPointMaster.transitPointName,
      ref_cod: licenses.refCod,
      payment_method_name: paymentTypeMaster.paymentTypeName,
      payment_subtype: paymentSubtypeMaster.paymentSubtype,
      destination_name: originMaster.originName,
      status: licenses.status,
      created_at: licenses.createdAt,
      updated_at: licenses.updatedAt,
    })
    .from(licenses)
    .leftJoin(clients, eq(clients.id, licenses.clientId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenses.bankId))
    .leftJoin(kindMaster, eq(kindMaster.id, licenses.kindId))
    .leftJoin(doneBy, eq(doneBy.id, licenses.licenseClearedBy))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenses.typeOfGoodsId))
    .leftJoin(unitMaster, eq(unitMaster.id, licenses.unitOfMeasurementId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, licenses.currencyId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, licenses.transportModeId))
    .leftJoin(transitPointMaster, eq(transitPointMaster.id, licenses.entryPostId))
    .leftJoin(paymentTypeMaster, eq(paymentTypeMaster.id, licenses.paymentMethodId))
    .leftJoin(paymentSubtypeMaster, eq(paymentSubtypeMaster.id, licenses.paymentSubtypeId))
    .leftJoin(originMaster, eq(originMaster.id, licenses.destinationId))
    .where(eq(licenses.id, id))
    .limit(1);

  return row ?? null;
}

export type LicenseDetail = NonNullable<Awaited<ReturnType<typeof getLicenseDetail>>>;
