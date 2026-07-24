import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bivacPartial } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { bivacPartialUpdateSchema } from '@/schemas';
import { getPartialView, getAllocationContext } from '@/db/queries/bivac';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/v1/bivac/partials/{id} — one PARTIELLE with derived used/remaining.
export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  if (!id) return fail('Invalid PARTIELLE id', 400);

  const view = await getPartialView(id);
  if (!view) return fail('PARTIELLE not found', 404);
  return ok(view);
});

// POST /api/v1/bivac/partials/{id} — update the five allocation amounts.
// Rejects any change that would push the licence's total allocation past its
// capacity (mirrors main's only server-side rule).
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  if (!id) return fail('Invalid PARTIELLE id', 400);

  const body = bivacPartialUpdateSchema.parse(await req.json());

  const [existing] = await db
    .select({ id: bivacPartial.id, licenseId: bivacPartial.licenseId })
    .from(bivacPartial)
    .where(and(eq(bivacPartial.id, id), eq(bivacPartial.display, 'Y')))
    .limit(1);
  if (!existing) return fail('PARTIELLE not found', 404);

  const ctx = await getAllocationContext(existing.licenseId, id);
  if (!ctx) return fail('License not found', 404);

  // Capacity guard, one dimension at a time, so the message names the offender.
  const checks: Array<{ label: string; incoming: number; other: number; cap: number }> = [
    { label: 'Weight', incoming: body.partial_weight, other: ctx.allocatedByOthers.weight, cap: ctx.capacity.weight },
    { label: 'FOB', incoming: body.partial_fob, other: ctx.allocatedByOthers.fob, cap: ctx.capacity.fob },
    { label: 'Insurance', incoming: body.partial_insurance, other: ctx.allocatedByOthers.insurance, cap: ctx.capacity.insurance },
    { label: 'Freight', incoming: body.partial_freight, other: ctx.allocatedByOthers.freight, cap: ctx.capacity.freight },
    { label: 'Other Costs', incoming: body.partial_other_costs, other: ctx.allocatedByOthers.other_costs, cap: ctx.capacity.other_costs },
  ];
  for (const c of checks) {
    const newTotal = round2(c.other + c.incoming);
    if (newTotal > c.cap) {
      const available = round2(c.cap - c.other);
      return fail(
        `Total allocated ${c.label} (${newTotal}) exceeds licence ${c.label} (${c.cap}). Available: ${available}`,
        422,
        { field: c.label.toLowerCase().replace(' ', '_'), code: 'over_allocated' },
      );
    }
  }

  await db
    .update(bivacPartial)
    .set({
      partialWeight: String(body.partial_weight),
      partialFob: String(body.partial_fob),
      partialInsurance: String(body.partial_insurance),
      partialFreight: String(body.partial_freight),
      partialOtherCosts: String(body.partial_other_costs),
      updatedBy: session.uid,
      updatedAt: new Date(),
    })
    .where(eq(bivacPartial.id, id));

  const view = await getPartialView(id);
  return ok(view);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
