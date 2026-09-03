// GET /api/v1/mca-ref-formats/preview?target=export&count=5&client_id=1&license_id=3
//
// The references a create would actually be given, built by the same generator
// that will assign them (§4.33) — not an illustration of the format.
//
// This exists because taking the typed MCA prefix off the bulk-create screen
// also took away the operator's sight of what the records would be called. A
// reference that appears only after the batch is committed is one an operator
// cannot check beforehand, which is exactly when checking is cheap.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { generateReferences } from '@/db/queries/mcaRefGenerator';
import { isTargetKey, MCA_REF_TARGETS } from '@/lib/mcaRefFormat';

// The query carries whatever ids the target's resolver needs; each one validates
// only what it reads, so the schema stays permissive about the rest.
const querySchema = z.object({
  target: z.string().min(1),
  // Matches MAX_ENTRIES on the export grid, which shows a reference per row —
  // a lower cap here would leave later rows with no reference to display.
  count: z.coerce.number().int().min(1).max(200).default(1),
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  kind_id: z.coerce.number().int().positive().optional(),
  type_of_goods_id: z.coerce.number().int().positive().optional(),
  transport_mode_id: z.coerce.number().int().positive().optional(),
  location: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(searchParams.entries()));
  if (!isTargetKey(q.target)) {
    return fail(`"${q.target}" is not a reference this app generates.`, 422);
  }

  const { target, count, ...values } = q;
  const refs = await generateReferences(target, values, count);

  // An empty result means a code the format asks for is missing — say which
  // record to complete rather than returning a blank list (§4.23).
  return ok({
    target,
    label: `${MCA_REF_TARGETS[target].label} — ${MCA_REF_TARGETS[target].fieldLabel}`,
    refs: refs.map((r) => r.ref),
    resolved: refs.length > 0,
  });
});
