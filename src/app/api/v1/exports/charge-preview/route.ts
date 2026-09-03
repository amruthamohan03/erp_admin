// POST /api/v1/exports/charge-preview
//
// The CEEC / CGEA / OCC / LMC / OGEFREM amounts a batch would be given, computed
// by the SAME rules and the SAME evaluator that write them at insert
// (loadExportChargeRules + computeExportCharges).
//
// This endpoint exists so the create grid can show those figures before the
// batch is committed WITHOUT a second copy of the arithmetic. The legacy screen
// had exactly that: `calculateCEECAmount()` in PHP and again in JavaScript, so a
// tariff change had to be made twice and the two quietly disagreed in between.
// Here the amounts are rows in tax_rule_master_t (§4.2) and there is one place
// that reads them.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { loadExportChargeRules, computeExportCharges } from '@/lib/exports/charges';

const nullableId = z.coerce.number().int().positive().nullable().optional();

const bodySchema = z.object({
  // Carried by the licence, so it is the same for every row in the batch.
  type_of_goods_id: nullableId,
  rows: z
    .array(
      z.object({
        weight: z.coerce.number().nonnegative().default(0),
        fob: z.coerce.number().nonnegative().default(0),
        feet_container_id: nullableId,
      }),
    )
    .max(200),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bodySchema.parse(await req.json());
  if (body.rows.length === 0) return ok({ rows: [] });

  // Loaded once for the whole batch, exactly as bulk-create does — a rule lookup
  // per row would be the same answer fetched N times.
  const rules = await loadExportChargeRules();

  return ok({
    rows: body.rows.map((r) =>
      computeExportCharges(rules, {
        weight: r.weight,
        fob: r.fob,
        type_of_goods_id: body.type_of_goods_id ?? null,
        feet_container_id: r.feet_container_id ?? null,
      }),
    ),
  });
});
