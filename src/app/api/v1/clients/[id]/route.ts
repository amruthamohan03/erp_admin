import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clientMaster,
  groupCompanyMaster,
  industryMaster,
  refererMaster,
  officeMaster,
  phaseMaster,
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
        rccm_number: clientMaster.rccmNumber,
        rccm_file: clientMaster.rccmFile,
        import_export_number: clientMaster.importExportNumber,
        import_export_validity: clientMaster.importExportValidity,
        import_export_file: clientMaster.importExportFile,
        attestation_number: clientMaster.attestationNumber,
        attestation_validity: clientMaster.attestationValidity,
        attestation_file: clientMaster.attestationFile,
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
    return ok(row);
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
