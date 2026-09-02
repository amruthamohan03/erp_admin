// §4.1 — read and update the reference-number formats edited under Developer
// Options → Reference Formats.
//
// GET returns a complete set (a missing or deactivated row falls back to its
// shipped default) so the setup screen always renders all six references. PUT
// upserts the submitted rows in one transaction and records an audit entry
// (§4.28 — a configuration change is as consequential as a data one, and this
// one decides what every consignment created afterwards is called).
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mcaRefFormatMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadMcaRefFormats } from '@/db/queries/mcaRefFormats';
import { mcaRefFormatsUpdateSchema } from '@/schemas';
import { recordAudit } from '@/lib/audit/recordAudit';
import { MCA_REF_TARGETS, previewMcaRef, type McaRefSegment } from '@/lib/mcaRefFormat';

/** The sample a format renders to — the readable half of an audit diff. */
function snapshot(formats: Array<{ target_key: keyof typeof MCA_REF_TARGETS; segments: McaRefSegment[] }>) {
  return Object.fromEntries(formats.map((f) => [f.target_key, previewMcaRef(f.segments, f.target_key)]));
}

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await loadMcaRefFormats());
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const before = await loadMcaRefFormats();
  const { formats } = mcaRefFormatsUpdateSchema.parse(await req.json());

  await db.transaction(async (tx) => {
    for (const f of formats) {
      await tx
        .insert(mcaRefFormatMaster)
        .values({
          targetKey: f.target_key,
          formatName: f.format_name,
          segments: f.segments as McaRefSegment[],
          display: f.display,
          createdBy: session.uid,
          updatedBy: session.uid,
        })
        .onConflictDoUpdate({
          target: mcaRefFormatMaster.targetKey,
          set: {
            formatName: f.format_name,
            segments: f.segments as McaRefSegment[],
            display: f.display,
            updatedBy: session.uid,
            updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
          },
        });
    }

    // The diff records the SHAPE each reference now takes, not the raw JSON —
    // "NMI-IDCOR26-0001 → IDCOR26-0001-NMI" is what someone reading the log
    // months later needs, and it is the thing that actually changed for them.
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'settings_change',
      entityType: 'mca-ref-format',
      entityId: 'all',
      before: snapshot(before),
      after: snapshot(formats),
      metadata: { targets: formats.map((f) => f.target_key) },
    });
  });

  return ok(await loadMcaRefFormats());
});
