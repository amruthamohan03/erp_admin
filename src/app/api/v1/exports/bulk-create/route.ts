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
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { generateReferences } from '@/db/queries/mcaRefGenerator';
import { exportsBulkCreateSchema } from '@/schemas/exports-bulk';
import {
  loadExportChargeRules,
  computeExportCharges,
} from '@/lib/exports/charges';

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
  // Nullable in main's licenses model (client is set per-accordion).
  clientId: number | null;
  weightCap: string | null;
  /** FOB already consumed on this licence, by imports and exports alike. */
  used: number;
  /** Weight already consumed, same basis. */
  usedWeight: number;
}

async function loadLicenseFacts(
  licenseId: number,
): Promise<LicenseFacts | null> {
  const [lic] = await db
    .select({
      id: licenseT.id,
      // main's licenses model: fob_declared is the declared FOB ceiling.
      amount: licenseT.fobDeclared,
      // The weight ceiling. Enforced alongside FOB — a licence caps both, and a
      // batch that fits the money can still exceed the tonnage.
      weightCap: licenseT.weight,
      clientId: licenseT.clientId,
    })
    .from(licenseT)
    .where(eq(licenseT.id, licenseId))
    .limit(1);
  if (!lic) return null;

  // Consumption across every LIVE consignment on this licence — IMPORTS AS WELL
  // AS EXPORTS. A licence is drawn down by both, and /licenses/{id}/usage (which
  // feeds the "Remaining" figures the operator reads before submitting) has
  // always counted both. Counting only exports here made the server permit more
  // than the screen said was left.
  const [expUsed] = await db
    .select({
      fob: sql<string>`COALESCE(SUM(${exportT.fob}), 0)`.as('fob'),
      weight: sql<string>`COALESCE(SUM(${exportT.weight}), 0)`.as('weight'),
    })
    .from(exportT)
    .where(and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')));

  const [impUsed] = await db
    .select({
      fob: sql<string>`COALESCE(SUM(${importT.fob}), 0)`.as('fob'),
      weight: sql<string>`COALESCE(SUM(${importT.weight}), 0)`.as('weight'),
    })
    .from(importT)
    .where(and(eq(importT.licenseId, licenseId), eq(importT.display, 'Y')));

  return {
    ...lic,
    used: Number(expUsed?.fob ?? 0) + Number(impUsed?.fob ?? 0),
    usedWeight: Number(expUsed?.weight ?? 0) + Number(impUsed?.weight ?? 0),
  };
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

  // Cap check — a licence caps BOTH the value and the tonnage it may carry, and
  // nothing is written if either would be exceeded. A null ceiling means the
  // operator recorded none, which is "no cap" rather than "zero".
  //
  // Both are checked before either is reported, so an operator over on both is
  // told once instead of fixing the FOB, resubmitting, and being sent back again
  // for the weight (§4.23).
  {
    const overruns: string[] = [];

    if (lic.amount != null) {
      const cap = Number(lic.amount);
      const requested = rows.reduce((s, r) => s + Number(r.fob ?? 0), 0);
      const remaining = cap - lic.used;
      if (requested > remaining) {
        overruns.push(
          `FOB: this batch totals ${requested.toFixed(2)} but only ${remaining.toFixed(2)} is left on the licence ` +
            `(cap ${cap.toFixed(2)} − ${lic.used.toFixed(2)} already used) — over by ${(requested - remaining).toFixed(2)}.`,
        );
      }
    }

    if (lic.weightCap != null) {
      const cap = Number(lic.weightCap);
      const requested = rows.reduce((s, r) => s + Number(r.weight ?? 0), 0);
      const remaining = cap - lic.usedWeight;
      if (requested > remaining) {
        overruns.push(
          `Weight: this batch totals ${requested.toFixed(3)} MT but only ${remaining.toFixed(3)} MT is left on the licence ` +
            `(cap ${cap.toFixed(3)} − ${lic.usedWeight.toFixed(3)} already used) — over by ${(requested - remaining).toFixed(3)} MT.`,
        );
      }
    }

    if (overruns.length > 0) {
      throw new BadRequestError(
        `Nothing was created — the batch exceeds what this licence has left. ${overruns.join(' ')}`,
      );
    }
  }

  // Pre-load all charge rules once, before the transaction opens —
  // reads outside the tx keep the transactional lock window as
  // short as possible.
  const chargeRules = await loadExportChargeRules();

  const createdIds = await db.transaction(async (tx) => {
    // §4.33 — references come from the format configured under Developer Options,
    // via the same generator the single-record form uses. The operator used to
    // type a prefix here and the route appended `-0001`, which meant an export
    // created from this screen could be named differently from one created on the
    // form, and neither followed the configured format.
    //
    // Generated inside the transaction and all at once, so the run of numbers is
    // taken from one consistent view of what has already been issued.
    const refs = await generateReferences(
      'export',
      { client_id: common.client_id, license_id: common.license_id },
      rows.length,
      tx,
    );
    if (refs.length !== rows.length) {
      throw new BadRequestError(
        'The MCA reference could not be built — the licence is missing its kind, type of goods or transport mode, or the client has no short code. Complete the licence and try again.',
      );
    }

    const ids: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const mcaRef = refs[i].ref;

      // Pre-check duplicate (partial live index on mca_ref); this
      // gives a nicer error than a Postgres unique-violation on
      // the insert.
      const [dup] = await tx
        .select({ id: exportT.id })
        .from(exportT)
        .where(and(eq(exportT.mcaRef, mcaRef), eq(exportT.display, 'Y')))
        .limit(1);
      if (dup) {
        // The generator numbers from the highest already issued, so reaching
        // here means another batch claimed this reference between the two —
        // retrying picks up from the new highest.
        throw new ConflictError(
          `MCA ref "${mcaRef}" was taken while this batch was being saved. Nothing was created — submit it again to get the next free references.`,
        );
      }

      // The configured rate, then the operator's figure where they gave one.
      // A blank cell means "use the rate" rather than "charge nothing", so the
      // rates are computed for every row regardless and only overridden per
      // column — clearing one amount cannot silently zero it (§4.2).
      const rates = computeExportCharges(chargeRules, {
        weight: Number(r.weight ?? 0),
        fob: Number(r.fob ?? 0),
        type_of_goods_id: common.type_of_goods_id ?? null,
        feet_container_id: r.feet_container_id ?? null,
      });
      const override = (
        supplied: number | null | undefined,
        rate: string | null,
      ): string | null => (supplied == null ? rate : supplied.toFixed(2));
      const charges = {
        ceec_amount: override(r.ceec_amount, rates.ceec_amount),
        cgea_amount: override(r.cgea_amount, rates.cgea_amount),
        occ_amount: override(r.occ_amount, rates.occ_amount),
        lmc_amount: override(r.lmc_amount, rates.lmc_amount),
        ogefrem_amount: override(r.ogefrem_amount, rates.ogefrem_amount),
      };

      const values = {
        clientId: common.client_id,
        licenseId: common.license_id,
        mcaRef,
        kind: common.kind_id ?? null,
        transportMode: common.transport_mode_id ?? null,
        typeOfGoods: common.type_of_goods_id ?? null,
        regime: common.regime_id ?? null,
        typesOfClearance: common.types_of_clearance_id ?? null,
        currency: common.currency_id ?? null,
        buyer: norm(common.buyer),
        bpNo: norm(common.bp_no),
        loadingDate: r.loading_date ?? null,
        bpDate: r.bp_date ?? null,
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
        feetContainer: r.feet_container_id ?? null,
        dgdaSealNo: norm(r.dgda_seal_no),
        numberOfSeals: r.number_of_seals ?? null,
        ceecAmount: charges.ceec_amount,
        cgeaAmount: charges.cgea_amount,
        occAmount: charges.occ_amount,
        lmcAmount: charges.lmc_amount,
        ogefremAmount: charges.ogefrem_amount,
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
