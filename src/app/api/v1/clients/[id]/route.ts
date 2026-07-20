import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inArray } from 'drizzle-orm';
import {
  clientMaster,
  groupCompanyMaster,
  industryMaster,
  refererMaster,
  officeMaster,
  phaseMaster,
  filesT,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { clientUpdateSchema } from '@/schemas';
import { updateBodyToPatch } from '@/lib/clients/serialize';
import type { ClientMasterInsert } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/clients/{id}
// Full client record with the five FK display names joined
// (group_company, industry, referred_by, office_location, phase) so
// the detail page can render labels without a second round-trip.

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({
        id: clientMaster.id,
        client_code: clientMaster.clientCode,
        name: clientMaster.name,
        legal_name: clientMaster.legalName,
        client_type: clientMaster.clientType,
        group_company_id: clientMaster.groupCompanyId,
        group_company_name: groupCompanyMaster.groupCompanyName,
        industry_type_id: clientMaster.industryTypeId,
        industry_name: industryMaster.industryName,
        referred_by_id: clientMaster.referredById,
        referred_by_name: refererMaster.refererName,
        office_location_id: clientMaster.officeLocationId,
        office_location_name: officeMaster.locationName,
        phase_id: clientMaster.phaseId,
        phase_name: phaseMaster.phaseName,
        phase_start_date: clientMaster.phaseStartDate,
        phase_end_date: clientMaster.phaseEndDate,
        contact_person: clientMaster.contactPerson,
        email: clientMaster.email,
        email_secondary: clientMaster.emailSecondary,
        phone: clientMaster.phone,
        phone_secondary: clientMaster.phoneSecondary,
        address: clientMaster.address,
        id_nat_number: clientMaster.idNatNumber,
        id_nat_file: clientMaster.idNatFile,
        id_nat_file_id: clientMaster.idNatFileId,
        rccm_number: clientMaster.rccmNumber,
        rccm_file: clientMaster.rccmFile,
        rccm_file_id: clientMaster.rccmFileId,
        import_export_number: clientMaster.importExportNumber,
        import_export_validity: clientMaster.importExportValidity,
        import_export_file: clientMaster.importExportFile,
        import_export_file_id: clientMaster.importExportFileId,
        attestation_number: clientMaster.attestationNumber,
        attestation_validity: clientMaster.attestationValidity,
        attestation_file: clientMaster.attestationFile,
        attestation_file_id: clientMaster.attestationFileId,
        nif_number: clientMaster.nifNumber,
        tax_id: clientMaster.taxId,
        payment_contact_email: clientMaster.paymentContactEmail,
        payment_contact_phone: clientMaster.paymentContactPhone,
        display: clientMaster.display,
        created_at: clientMaster.createdAt,
        updated_at: clientMaster.updatedAt,
      })
      .from(clientMaster)
      .leftJoin(
        groupCompanyMaster,
        eq(groupCompanyMaster.id, clientMaster.groupCompanyId),
      )
      .leftJoin(
        industryMaster,
        eq(industryMaster.id, clientMaster.industryTypeId),
      )
      .leftJoin(
        refererMaster,
        eq(refererMaster.id, clientMaster.referredById),
      )
      .leftJoin(
        officeMaster,
        eq(officeMaster.id, clientMaster.officeLocationId),
      )
      .leftJoin(phaseMaster, eq(phaseMaster.id, clientMaster.phaseId))
      .where(eq(clientMaster.id, id))
      .limit(1);

    if (!row) throw new NotFoundError();

    // Resolve attached-file metadata for the four regulatory
    // *_file_id columns. Single follow-up query with IN () — fewer
    // rows than four extra LEFT JOINs would return columns.
    const fileIds = [
      row.id_nat_file_id,
      row.rccm_file_id,
      row.import_export_file_id,
      row.attestation_file_id,
    ].filter((v): v is number => v != null);

    let filesById = new Map<
      number,
      { id: number; original_name: string; mime: string | null; size: number | null }
    >();
    if (fileIds.length > 0) {
      const fileRows = await db
        .select({
          id: filesT.id,
          original_name: filesT.originalName,
          mime: filesT.mime,
          size: filesT.size,
        })
        .from(filesT)
        .where(inArray(filesT.id, fileIds));
      filesById = new Map(fileRows.map((f) => [f.id, f]));
    }

    return ok({
      ...row,
      id_nat_file_info: row.id_nat_file_id
        ? filesById.get(row.id_nat_file_id) ?? null
        : null,
      rccm_file_info: row.rccm_file_id
        ? filesById.get(row.rccm_file_id) ?? null
        : null,
      import_export_file_info: row.import_export_file_id
        ? filesById.get(row.import_export_file_id) ?? null
        : null,
      attestation_file_info: row.attestation_file_id
        ? filesById.get(row.attestation_file_id) ?? null
        : null,
    });
  },
);

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const data = clientUpdateSchema.parse(await req.json());
    const patch = updateBodyToPatch(data) as Partial<ClientMasterInsert>;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    try {
      const [row] = await db
        .update(clientMaster)
        .set(patch)
        .where(eq(clientMaster.id, id))
        .returning({ id: clientMaster.id });

      if (!row) throw new NotFoundError();
      return ok({ id: row.id });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        throw new ConflictError('Conflict updating client');
      }
      throw err;
    }
  },
);

// Soft-delete: flip display to 'N'. References from license/invoice/
// etc. stay intact (FK is ON DELETE RESTRICT so a hard delete would
// fail anyway when dependent rows exist).

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .update(clientMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(clientMaster.id, id))
      .returning({ id: clientMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
