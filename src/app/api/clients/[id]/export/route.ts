// GET /api/clients/[id]/export → CSV download of a single client with all 49
// columns from clients_t, FK values resolved to the related master's name where
// possible (for human-readable export). Returns 404 if the client doesn't exist.
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clients,
  groupCompanyMaster,
  industryMaster,
  refererMaster,
  officeLocationMaster,
  phaseMaster,
  doneBy,
  usersT,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { toCsv, csvResponse, dateStamp } from '@/lib/csv';
import { alias } from 'drizzle-orm/pg-core';

type Ctx = { params: Promise<{ id: string }> };

// Three FKs into the same table (done_by_t) for liquidation_paid_by /
// license_cleared_by / license_submit_to_bank. Alias each so the join is unambiguous.
const liquidationPaidBy   = alias(doneBy, 'liq');
const licenseClearedBy    = alias(doneBy, 'lcb');
const licenseSubmitToBank = alias(doneBy, 'lsb');
// Two FKs into users_t for verified_by_id / approved_by_id.
const verifiedBy = alias(usersT, 'verifier');
const approvedBy = alias(usersT, 'approver');

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id:                       clients.id,
      company_name:             clients.companyName,
      short_name:               clients.shortName,
      client_type:              clients.clientType,
      group_company:            groupCompanyMaster.groupCompanyName,
      industry:                 industryMaster.industryName,
      referred_by:              refererMaster.refererName,
      office_location:          officeLocationMaster.locationName,
      address:                  clients.address,
      phase:                    phaseMaster.phaseName,
      phase_start_date:         clients.phaseStartDate,
      phase_end_date:           clients.phaseEndDate,
      contact_person:           clients.contactPerson,
      email:                    clients.email,
      email_secondary:          clients.emailSecondary,
      phone:                    clients.phone,
      phone_secondary:          clients.phoneSecondary,
      id_nat_number:            clients.idNatNumber,
      id_nat_file:              clients.idNatFile,
      rccm_number:              clients.rccmNumber,
      rccm_file:                clients.rccmFile,
      import_export_number:     clients.importExportNumber,
      import_export_validity:   clients.importExportValidity,
      import_export_file:       clients.importExportFile,
      attestation_number:       clients.attestationNumber,
      attestation_validity:     clients.attestationValidity,
      attestation_file:         clients.attestationFile,
      nif_number:               clients.nifNumber,
      payment_contact_email:    clients.paymentContactEmail,
      payment_contact_phone:    clients.paymentContactPhone,
      payment_term:             clients.paymentTerm,
      credit_term:              clients.creditTerm,
      liquidation_paid_by:      liquidationPaidBy.doneByName,
      license_cleared_by:       licenseClearedBy.doneByName,
      license_submit_to_bank:   licenseSubmitToBank.doneByName,
      contract_start_date:      clients.contractStartDate,
      contract_validity:        clients.contractValidity,
      approval_code:            clients.approvalCode,
      invoice_template:         clients.invoiceTemplate,
      verified_by:              verifiedBy.fullName,
      verified_by_date:         clients.verifiedByDate,
      approved_by:              approvedBy.fullName,
      approved_by_date:         clients.approvedByDate,
      remarks:                  clients.remarks,
      display:                  clients.display,
      created_at:               clients.createdAt,
      updated_at:               clients.updatedAt,
    })
    .from(clients)
    .leftJoin(groupCompanyMaster,    eq(clients.groupCompanyId,        groupCompanyMaster.id))
    .leftJoin(industryMaster,        eq(clients.industryTypeId,        industryMaster.id))
    .leftJoin(refererMaster,         eq(clients.referredById,          refererMaster.id))
    .leftJoin(officeLocationMaster,  eq(clients.officeLocationId,      officeLocationMaster.id))
    .leftJoin(phaseMaster,           eq(clients.phaseId,               phaseMaster.id))
    .leftJoin(liquidationPaidBy,     eq(clients.liquidationPaidBy,     liquidationPaidBy.id))
    .leftJoin(licenseClearedBy,      eq(clients.licenseClearedBy,      licenseClearedBy.id))
    .leftJoin(licenseSubmitToBank,   eq(clients.licenseSubmitToBank,   licenseSubmitToBank.id))
    .leftJoin(verifiedBy,            eq(clients.verifiedById,          verifiedBy.id))
    .leftJoin(approvedBy,            eq(clients.approvedById,          approvedBy.id))
    .where(eq(clients.id, id))
    .limit(1);

  if (!row) return fail('Client not found', 404);

  // Field-per-row layout (long format) — easier to read in Excel than 49
  // columns across one row, and matches how PhpSpreadsheet often emits
  // single-record exports.
  const longRows = Object.entries(row).map(([field, value]) => ({
    field,
    value,
  }));

  const csv = toCsv(longRows, [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Value' },
  ]);

  const safeCode = (row.short_name ?? 'client').replace(/[^A-Za-z0-9_-]/g, '');
  return csvResponse(csv, `client-${safeCode}-${row.id}-${dateStamp()}.csv`);
}
