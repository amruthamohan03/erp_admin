// POST /api/exports/bulk-insert — create many exports against one license in a
// single transaction (the legacy "Proceed to Create Exports" grid). Authorization
// reuses the §4.12 model (edit grant on the 'export' page). Enforces the cumulative
// license weight/FOB limit, auto-generates each MCA reference, computes the charge
// amounts from the config-driven `tiered` derives (no hardcoded math, §4.2), and
// writes one audit row per created export (§4.10) — all rolled back together on error.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exports,
  masterPage,
  masterPageAccordion,
  masterPageAccordionRole,
  masterPageAccordionField,
  sealIndividualNumbers,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { getDeriveSource } from '@/lib/pages/deriveSources';
import { parseDerive, computePureDerive } from '@/lib/pages/derive';
import { IN_TRANSIT_STATUS_ID } from '@/lib/exports/cardConditions';

const rowSchema = z.object({
  loading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  bp_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  site_of_loading_id: z.coerce.number().int().positive().nullable().optional(),
  destination: z.string().max(255).nullable().optional(),
  horse: z.string().max(50).nullable().optional(),
  trailer_1: z.string().max(50).nullable().optional(),
  trailer_2: z.string().max(50).nullable().optional(),
  feet_container: z.coerce.number().int().positive().nullable().optional(),
  wagon_ref: z.string().max(50).nullable().optional(),
  container: z.string().max(50).nullable().optional(),
  transporter: z.string().max(255).nullable().optional(),
  exit_point_id: z.coerce.number().int().positive().nullable().optional(),
  weight: z.coerce.number().nonnegative().optional(),
  fob: z.coerce.number().nonnegative().optional(),
  number_of_bags: z.coerce.number().int().nonnegative().nullable().optional(),
  lot_number: z.string().max(100).nullable().optional(),
  dgda_seal_no: z.string().max(255).nullable().optional(),
  number_of_seals: z.coerce.number().int().nonnegative().nullable().optional(),
});

const bodySchema = z.object({
  common: z.object({
    client_id: z.coerce.number().int().positive(),
    license_id: z.coerce.number().int().positive(),
    regime: z.coerce.number().int().positive(),
    types_of_clearance: z.coerce.number().int().positive(),
    bp_no: z.string().max(100).nullable().optional(),
  }),
  rows: z.array(rowSchema).min(1).max(3000),
});

type Row = z.infer<typeof rowSchema>;

const norm = (s: string | null | undefined): string | null =>
  s && s.trim() !== '' ? s.trim() : null;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  const { common, rows } = parsed.data;

  // Authorization: caller's role must have an 'edit' grant on the export page.
  const grant = await db
    .select({ id: masterPageAccordionRole.id })
    .from(masterPage)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
    .innerJoin(masterPageAccordionRole, eq(masterPageAccordionRole.accordionId, masterPageAccordion.id))
    .where(
      and(
        eq(masterPage.slug, 'export'),
        eq(masterPageAccordionRole.roleId, session.role_id),
        eq(masterPageAccordionRole.permission, 'edit'),
      ),
    )
    .limit(1);
  if (grant.length === 0) return fail('Forbidden — your role cannot create exports', 403);

  // License facts + remaining weight/FOB (cumulative across existing exports).
  const licRes = await db.execute(sql`
    SELECT l.kind_id, l.type_of_goods_id, l.transport_mode_id, l.currency_id, l.supplier,
           COALESCE(l.weight, 0) AS lic_weight,
           COALESCE(l.fob_declared, 0) AS lic_fob,
           COALESCE((SELECT SUM(weight) FROM exports_t WHERE license_id = l.id AND display = 'Y'), 0) AS used_weight,
           COALESCE((SELECT SUM(fob)    FROM exports_t WHERE license_id = l.id AND display = 'Y'), 0) AS used_fob
    FROM licenses_t l WHERE l.id = ${common.license_id} LIMIT 1
  `);
  const lic = (licRes as unknown as { rows?: Record<string, unknown>[] }).rows?.[0];
  if (!lic) return fail('License not found', 404);

  const availableWeight = Number(lic.lic_weight) - Number(lic.used_weight);
  const availableFob = Number(lic.lic_fob) - Number(lic.used_fob);

  let totalWeight = 0;
  let totalFob = 0;
  let hasWeight = false;
  for (const r of rows) {
    const w = Math.abs(Number(r.weight ?? 0));
    const f = Math.abs(Number(r.fob ?? 0));
    if (w > 0) hasWeight = true;
    totalWeight += w;
    totalFob += f;
  }
  if (!hasWeight) return fail('At least one entry must have weight > 0', 422);
  if (totalWeight > availableWeight) {
    return fail(
      `Weight exceeds license limit. Requested ${totalWeight.toFixed(3)} MT, available ${availableWeight.toFixed(3)} MT`,
      422,
    );
  }
  if (totalFob > availableFob) {
    return fail(
      `FOB exceeds license limit. Requested ${totalFob.toFixed(2)}, available ${availableFob.toFixed(2)}`,
      422,
    );
  }

  // MCA prefix + starting sequence (config-driven, exports_t-sequenced).
  const mcaSource = getDeriveSource('export_mca');
  const tokens = mcaSource
    ? await mcaSource.resolve({ client_id: common.client_id, license_id: common.license_id })
    : null;
  if (!tokens) return fail('Could not generate MCA reference (check client/license)', 422);
  const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
  const prefix = `${up(tokens.client_short)}-${up(tokens.kind_short)}${up(tokens.goods_short)}${up(tokens.transport_letter)}${tokens.year}-`;
  const startSeq = parseInt(String(tokens.seq), 10) || 1;

  // Charge derive specs (tiered) from the export page's charge fields.
  const chargeFieldNames = ['ceec_amount', 'cgea_amount', 'occ_amount', 'lmc_amount', 'ogefrem_amount'];
  const chargeFields = await db
    .select({ name: masterPageAccordionField.name, derive: masterPageAccordionField.derive })
    .from(masterPageAccordionField)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.id, masterPageAccordionField.accordionId))
    .innerJoin(masterPage, eq(masterPage.id, masterPageAccordion.pageId))
    .where(eq(masterPage.slug, 'export'));
  const chargeSpecs = new Map(
    chargeFields
      .filter((f) => chargeFieldNames.includes(f.name))
      .map((f) => [f.name, parseDerive(f.derive)] as const),
  );

  const typeOfGoods = lic.type_of_goods_id == null ? null : Number(lic.type_of_goods_id);

  const numStr = (n: number): string => String(n);

  const created = await db.transaction(async (tx) => {
    const ids: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r: Row = rows[i];
      const weight = Math.abs(Number(r.weight ?? 0));
      const fob = Math.abs(Number(r.fob ?? 0));
      const feetContainer = r.feet_container ?? null;
      const mcaRef = `${prefix}${String(startSeq + i).padStart(4, '0')}`;

      // Config-driven charge amounts for this row.
      const ctx = { weight, type_of_goods: typeOfGoods, feet_container: feetContainer };
      const amount = (name: string): string | null => {
        const v = computePureDerive(chargeSpecs.get(name) ?? null, ctx);
        return v === undefined || v === null ? null : numStr(Number(v));
      };

      const values = {
        clientId: common.client_id,
        licenseId: common.license_id,
        kind: lic.kind_id == null ? null : Number(lic.kind_id),
        typeOfGoods,
        transportMode: lic.transport_mode_id == null ? null : Number(lic.transport_mode_id),
        currency: lic.currency_id == null ? null : Number(lic.currency_id),
        buyer: lic.supplier == null ? null : String(lic.supplier),
        regime: common.regime,
        typesOfClearance: common.types_of_clearance,
        mcaRef,
        bpNo: norm(common.bp_no),
        weight: numStr(weight),
        fob: numStr(fob),
        numberOfBags: r.number_of_bags ?? null,
        lotNumber: norm(r.lot_number),
        horse: norm(r.horse),
        trailer1: norm(r.trailer_1),
        trailer2: norm(r.trailer_2),
        feetContainer,
        wagonRef: norm(r.wagon_ref),
        container: norm(r.container),
        transporter: norm(r.transporter),
        siteOfLoadingId: r.site_of_loading_id ?? null,
        destination: norm(r.destination),
        exitPointId: r.exit_point_id ?? null,
        loadingDate: r.loading_date ?? null,
        bpDate: r.bp_date ?? null,
        dgdaSealNo: norm(r.dgda_seal_no),
        numberOfSeals: r.number_of_seals ?? null,
        ceecAmount: amount('ceec_amount'),
        cgeaAmount: amount('cgea_amount'),
        occAmount: amount('occ_amount'),
        lmcAmount: amount('lmc_amount'),
        ogefremAmount: amount('ogefrem_amount'),
        clearingStatus: IN_TRANSIT_STATUS_ID,
        createdBy: session.uid,
        updatedBy: session.uid,
        display: 'Y' as const,
      };

      const [inserted] = await tx.insert(exports).values(values).returning({ id: exports.id });
      ids.push(inserted.id);

      // Reserve the chosen DGDA seals (Road) — flip Available → Used so they leave
      // the available pool. Only seals currently Available are reserved.
      const sealNums = (r.dgda_seal_no || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (sealNums.length > 0) {
        await tx
          .update(sealIndividualNumbers)
          .set({ status: 'Used', notes: `Export ${mcaRef}`, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
          .where(and(inArray(sealIndividualNumbers.sealNumber, sealNums), eq(sealIndividualNumbers.status, 'Available')));
      }

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: 'page:export',
        entityId: String(inserted.id),
        after: values,
        metadata: { accordion: 'bulk-insert', mca_ref: mcaRef, seals: sealNums },
      });
    }
    return ids;
  });

  return ok({ created: created.length, ids: created }, 201);
}
