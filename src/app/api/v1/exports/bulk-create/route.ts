import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, licenseT } from '@/db/schema';
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
import { exportsBulkCreateSchema } from '@/schemas/exports-bulk';

// POST /api/v1/exports/bulk-create
//
// Create N exports against ONE license in a single transaction —
// the branch analogue of main's /api/exports/bulk-insert. Rejects
// the whole batch if the cumulative FOB would exceed the license
// cap (license.amount minus SUM(fob) of existing live exports on
// the same license).
//
// MCA refs are auto-generated as `{prefix}-NNNN` (4-digit
// zero-pad), starting from 1. If any generated ref collides with
// an existing exports_t.mca_ref (unique index), the whole batch
// rolls back — no partial success. The caller can retry with a
// different prefix.
//
// Scope choices vs main:
//   * No config-driven charge computation (main used
//     masterPageAccordionField.derive; that shape doesn't exist on
//     this branch). Rows carry FOB/weight; charge columns stay
//     null and are filled later by the operator per-row.
//   * No seal reservation (branch has a different seal model —
//     wire that on a follow-up when the seals module stabilises).

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

  // Cumulative FOB used across every LIVE export on this license.
  const [used] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${exportT.fob}), 0)`.as('total'),
    })
    .from(exportT)
    .where(and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')));

  return { ...lic, used: Number(used?.total ?? 0) };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { common, rows } = exportsBulkCreateSchema.parse(await req.json());

  const lic = await loadLicenseFacts(common.license_id);
  if (!lic) throw new NotFoundError('License not found');
  if (lic.clientId !== common.client_id) {
    throw new BadRequestError(
      'License does not belong to the selected client',
    );
  }

  // Cap check — license.amount is the FOB ceiling on this branch.
  // Nullable amount means "no cap" (main-line behavior when the
  // operator hasn't recorded one); allow the batch through.
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

      // Pre-check duplicate (partial live index on mca_ref); this
      // gives a nicer error than a Postgres unique-violation on
      // the insert.
      const [dup] = await tx
        .select({ id: exportT.id })
        .from(exportT)
        .where(and(eq(exportT.mcaRef, mcaRef), eq(exportT.display, 'Y')))
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
        buyer: norm(common.buyer),
        bpNo: norm(common.bp_no),
        loadingDate: r.loading_date ?? null,
        weight: num(r.weight),
        fob: num(r.fob),
        numberOfBags: r.number_of_bags ?? null,
        lotNumber: norm(r.lot_number),
        horse: norm(r.horse),
        trailer1: norm(r.trailer_1),
        trailer2: norm(r.trailer_2),
        wagonRef: norm(r.wagon_ref),
        container: norm(r.container),
        transporter: norm(r.transporter),
        destination: norm(r.destination),
        siteOfLoadingId: r.site_of_loading_id ?? null,
        exitPointId: r.exit_point_id ?? null,
        feetContainerId: r.feet_container_id ?? null,
        dgdaSealNo: norm(r.dgda_seal_no),
        numberOfSeals: r.number_of_seals ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      };

      const [inserted] = await tx
        .insert(exportT)
        .values(values)
        .returning({ id: exportT.id });
      ids.push(inserted.id);

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: 'export',
        entityId: String(inserted.id),
        after: values,
        metadata: { source: 'bulk-create', mca_ref: mcaRef },
      });
    }
    return ids;
  });

  return ok({ created: createdIds.length, ids: createdIds }, { status: 201 });
});
