import type {
  ClientCreateInput,
  ClientUpdateInput,
} from '@/schemas/clients';

// Snake-case API body → camelCase Drizzle insert/update object.
// Mirrors the pattern in src/lib/imports/serialize.ts + src/lib/exports.
// Kept out of the route file so the mapping stays in one place.

export function createBodyToInsert(
  body: ClientCreateInput,
): Record<string, unknown> {
  return {
    clientCode: body.client_code,
    name: body.name,
    legalName: body.legal_name ?? null,
    clientType: body.client_type ?? null,
    groupCompanyId: body.group_company_id ?? null,
    industryTypeId: body.industry_type_id ?? null,
    referredById: body.referred_by_id ?? null,
    officeLocationId: body.office_location_id ?? null,
    phaseId: body.phase_id ?? null,
    phaseStartDate: body.phase_start_date ?? null,
    phaseEndDate: body.phase_end_date ?? null,
    contactPerson: body.contact_person ?? null,
    email: body.email ?? null,
    emailSecondary: body.email_secondary ?? null,
    phone: body.phone ?? null,
    phoneSecondary: body.phone_secondary ?? null,
    address: body.address ?? null,
    idNatNumber: body.id_nat_number ?? null,
    idNatFile: body.id_nat_file ?? null,
    idNatFileId: body.id_nat_file_id ?? null,
    rccmNumber: body.rccm_number ?? null,
    rccmFile: body.rccm_file ?? null,
    rccmFileId: body.rccm_file_id ?? null,
    importExportNumber: body.import_export_number ?? null,
    importExportValidity: body.import_export_validity ?? null,
    importExportFile: body.import_export_file ?? null,
    importExportFileId: body.import_export_file_id ?? null,
    attestationNumber: body.attestation_number ?? null,
    attestationValidity: body.attestation_validity ?? null,
    attestationFile: body.attestation_file ?? null,
    attestationFileId: body.attestation_file_id ?? null,
    nifNumber: body.nif_number ?? null,
    taxId: body.tax_id ?? null,
    paymentContactEmail: body.payment_contact_email ?? null,
    paymentContactPhone: body.payment_contact_phone ?? null,
  };
}

// Update patch — only sets keys present in the body so a PATCH-style
// partial update leaves untouched fields alone.
export function updateBodyToPatch(
  body: ClientUpdateInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.legal_name !== undefined) patch.legalName = body.legal_name;
  if (body.client_type !== undefined) patch.clientType = body.client_type;
  if (body.group_company_id !== undefined) patch.groupCompanyId = body.group_company_id;
  if (body.industry_type_id !== undefined) patch.industryTypeId = body.industry_type_id;
  if (body.referred_by_id !== undefined) patch.referredById = body.referred_by_id;
  if (body.office_location_id !== undefined) patch.officeLocationId = body.office_location_id;
  if (body.phase_id !== undefined) patch.phaseId = body.phase_id;
  if (body.phase_start_date !== undefined) patch.phaseStartDate = body.phase_start_date;
  if (body.phase_end_date !== undefined) patch.phaseEndDate = body.phase_end_date;
  if (body.contact_person !== undefined) patch.contactPerson = body.contact_person;
  if (body.email !== undefined) patch.email = body.email;
  if (body.email_secondary !== undefined) patch.emailSecondary = body.email_secondary;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.phone_secondary !== undefined) patch.phoneSecondary = body.phone_secondary;
  if (body.address !== undefined) patch.address = body.address;
  if (body.id_nat_number !== undefined) patch.idNatNumber = body.id_nat_number;
  if (body.id_nat_file !== undefined) patch.idNatFile = body.id_nat_file;
  if (body.id_nat_file_id !== undefined) patch.idNatFileId = body.id_nat_file_id;
  if (body.rccm_number !== undefined) patch.rccmNumber = body.rccm_number;
  if (body.rccm_file !== undefined) patch.rccmFile = body.rccm_file;
  if (body.rccm_file_id !== undefined) patch.rccmFileId = body.rccm_file_id;
  if (body.import_export_number !== undefined) patch.importExportNumber = body.import_export_number;
  if (body.import_export_validity !== undefined) patch.importExportValidity = body.import_export_validity;
  if (body.import_export_file !== undefined) patch.importExportFile = body.import_export_file;
  if (body.import_export_file_id !== undefined) patch.importExportFileId = body.import_export_file_id;
  if (body.attestation_number !== undefined) patch.attestationNumber = body.attestation_number;
  if (body.attestation_validity !== undefined) patch.attestationValidity = body.attestation_validity;
  if (body.attestation_file !== undefined) patch.attestationFile = body.attestation_file;
  if (body.attestation_file_id !== undefined) patch.attestationFileId = body.attestation_file_id;
  if (body.nif_number !== undefined) patch.nifNumber = body.nif_number;
  if (body.tax_id !== undefined) patch.taxId = body.tax_id;
  if (body.payment_contact_email !== undefined) patch.paymentContactEmail = body.payment_contact_email;
  if (body.payment_contact_phone !== undefined) patch.paymentContactPhone = body.payment_contact_phone;
  if (body.display !== undefined) patch.display = body.display;
  return patch;
}

// Column list for GET responses — every persisted field. Kept as a
// factory function so the caller can pass its own `clientMaster`
// alias if needed.
export function clientSelectColumns() {
  return {
    // filled in by the caller — see routes for the shape
  };
}
