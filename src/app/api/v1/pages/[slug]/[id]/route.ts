// §4.12 — POST one accordion's worth of changes to the page's target entity.
// §4.10 — wraps the write + audit_log insert in a single Drizzle transaction.
//
// Request body shape:
//   { accordion_slug: 'basic', values: { company_name: '...', short_name: '...' } }
//
// - 'new' as the path id creates a new entity (only one accordion is allowed
//   to drive a create — the first one in display_order; other accordions
//   require an existing id).
// - Existing id: partial UPDATE limited to columns owned by the named accordion.
//
// The values object is filtered against the field list for the named accordion
// (server-side whitelist), so untrusted keys can't slip extra columns in.
import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  masterPage,
  masterPageAccordion,
  masterPageAccordionRole,
  masterPageAccordionField,
  sealNumber,
} from '@/db/schema';
import { ok, fail, requireAuth, isResponse } from '@/lib/api';
import { fetchEntityValues, getPageTarget, safeColumnsFor } from '@/lib/pages/targets';
import { effectiveFieldPermission, fetchFieldOverrides } from '@/lib/pages/fieldGrants';
import { recordAudit } from '@/lib/audit/recordAudit';
import { parseConditions, resolveFieldState, checkBounds } from '@/lib/pages/conditions';
import { parseDerive, isPureDerive, computePureDerive } from '@/lib/pages/derive';

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { slug, id: rawId } = await params;

  const target = getPageTarget(slug);
  if (!target) return fail('Unknown page', 404);

  let body: { accordion_slug?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const accordionSlug = body.accordion_slug;
  const submittedValues = body.values ?? {};
  if (!accordionSlug || typeof accordionSlug !== 'string') {
    return fail('accordion_slug is required', 422);
  }

  // 1) Resolve the page + accordion + permission for this role.
  const rows = await db
    .select({
      page_id: masterPage.id,
      page_target: masterPage.targetTable,
      accordion_id: masterPageAccordion.id,
      permission: masterPageAccordionRole.permission,
    })
    .from(masterPage)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
    .innerJoin(
      masterPageAccordionRole,
      eq(masterPageAccordionRole.accordionId, masterPageAccordion.id),
    )
    .where(
      and(
        eq(masterPage.slug, slug),
        eq(masterPage.display, 'Y'),
        eq(masterPageAccordion.slug, accordionSlug),
        eq(masterPageAccordion.display, 'Y'),
        eq(masterPageAccordionRole.roleId, session.role_id),
      ),
    )
    .limit(1);

  const grant = rows[0];
  if (!grant) return fail('Forbidden — this accordion is not visible to your role', 403);
  if (grant.permission !== 'edit') return fail('Forbidden — read-only access', 403);

  // 2) Fetch the field definitions for THIS accordion to build a whitelist.
  const fields = await db
    .select({
      id: masterPageAccordionField.id,
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      required: masterPageAccordionField.required,
      field_type: masterPageAccordionField.fieldType,
      conditions: masterPageAccordionField.conditions,
      derive: masterPageAccordionField.derive,
    })
    .from(masterPageAccordionField)
    .where(
      and(
        eq(masterPageAccordionField.accordionId, grant.accordion_id),
        eq(masterPageAccordionField.display, 'Y'),
      ),
    )
    .orderBy(asc(masterPageAccordionField.displayOrder));

  if (fields.length === 0) return fail('Accordion has no fields configured', 500);

  // §4.14 — resolve each field's effective permission for this role; only fields
  // that resolve to 'edit' may be written (absence of an override ⇒ inherit the
  // accordion's 'edit', i.e. the prior behavior).
  const overrides = await fetchFieldOverrides(fields.map((f) => f.id), session.role_id);
  const editableNames = new Set<string>();
  for (const f of fields) {
    if (effectiveFieldPermission(grant.permission as 'view' | 'edit', overrides.get(f.id)) === 'edit') {
      editableNames.add(f.name);
    }
  }

  // 3) Decide create vs update — needed before condition evaluation so we can
  //    build the evaluation context from the existing row.
  const isCreate = rawId === 'new';
  const entityId = isCreate ? null : Number(rawId);
  if (!isCreate && (entityId === null || Number.isNaN(entityId))) {
    return fail('Invalid entity id', 400);
  }

  // §4.12 — config-driven conditions reference OTHER fields (e.g. an invoice
  // field hidden when kind_id is MCA), which may live on a different accordion.
  // Build the evaluation context from the full existing row (for updates) merged
  // with this submission, so the rules see the complete form state. This is the
  // server-side mirror of the client's reactive evaluation — defense in depth.
  // fetchEntityValues already projects `id`; don't list it twice.
  const allColumns = safeColumnsFor(slug, Array.from(target.allowedColumns)).filter((c) => c !== 'id');
  const before = !isCreate && entityId !== null
    ? await fetchEntityValues(slug, entityId, allColumns)
    : null;
  if (!isCreate && !before) return fail('Entity not found', 404);
  const evalContext: Record<string, unknown> = { ...(before ?? {}), ...submittedValues };

  // 4) Restrict the incoming values to (editable ∩ accordion ∩ target columns),
  //    and drop any field that resolves to hidden or read-only for these values.
  const safeColumnSet = new Set(safeColumnsFor(slug, fields.map((f) => f.name)));

  const patch: Record<string, unknown> = {};
  for (const f of fields) {
    if (!safeColumnSet.has(f.name) || !editableNames.has(f.name)) continue;
    if (!(f.name in submittedValues)) continue;
    const state = resolveFieldState(parseConditions(f.conditions), f.required, evalContext);
    // A field the rules hide or freeze must not be written from this request.
    if (!state.visible || state.readonly) continue;
    patch[f.name] = submittedValues[f.name];
  }

  // §4.12 — pure derives (statusMap / formula) are authoritative: recompute them
  // server-side from the full context so a tampered client value can't persist a
  // wrong Document Status / remaining amount.
  for (const f of fields) {
    if (!(f.name in patch)) continue;
    const spec = parseDerive(f.derive);
    if (!isPureDerive(spec)) continue;
    const computed = computePureDerive(spec, evalContext);
    if (computed !== undefined) patch[f.name] = computed;
  }

  // 5) Validation — required + min/max — only over fields that are editable AND
  //    currently visible. resolveFieldState already forces required=false for a
  //    hidden field, so a section the kind hides won't block the save.
  for (const f of fields) {
    if (!editableNames.has(f.name)) continue;
    const state = resolveFieldState(parseConditions(f.conditions), f.required, evalContext);
    if (!state.visible) continue;
    if (state.required) {
      const v = patch[f.name];
      const empty = v === undefined || v === null || v === '';
      if (empty) return fail(`Required field missing: ${f.label}`, 422, { field: f.name });
    }
    const boundError = checkBounds(state, f.label, submittedValues[f.name]);
    if (boundError) return fail(boundError, 422, { field: f.name });
  }

  // 7) Transactional write + audit.
  const newId = await db.transaction(async (tx) => {
    // Apply the partial update / insert. We build the SQL dynamically because
    // the column set is data-driven — but every identifier comes from the
    // whitelisted `safeColumns` set, so this is safe.
    let savedId: number;

    if (isCreate) {
      // Always set created_by + updated_by on inserts; the entity table requires
      // them in practice.
      const cols = [...Object.keys(patch), 'created_by', 'updated_by'];
      const vals = [
        ...cols.slice(0, -2).map((c) => sql`${patch[c] ?? null}`),
        sql`${session.uid}`,
        sql`${session.uid}`,
      ];

      const colsSql = sql.join(cols.map((c) => sql.identifier(c)), sql`, `);
      const valsSql = sql.join(vals, sql`, `);

      const result = await tx.execute(
        sql`INSERT INTO ${target.table} (${colsSql}) VALUES (${valsSql}) RETURNING id`,
      );
      const row = (result as unknown as { rows: { id: number }[] }).rows[0];
      savedId = row.id;
    } else {
      const setEntries = Object.keys(patch).map(
        (c) => sql`${sql.identifier(c)} = ${patch[c] ?? null}`,
      );
      setEntries.push(sql`${sql.identifier('updated_by')} = ${session.uid}`);
      setEntries.push(sql`${sql.identifier('updated_at')} = CURRENT_TIMESTAMP`);
      const setSql = sql.join(setEntries, sql`, `);

      await tx.execute(
        sql`UPDATE ${target.table} SET ${setSql} WHERE id = ${entityId}`,
      );
      savedId = entityId as number;
    }

    // Seal reservation for the export page: keep seal_number in sync with the
    // export's dgda_seal_no — reserve newly-added seals (Available→Used) and
    // release removed ones (Used→Available). Only runs when the export's seal
    // field is part of this save.
    if (slug === 'export' && 'dgda_seal_no' in patch) {
      const splitSeals = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const newSeals = splitSeals(patch['dgda_seal_no']);
      const oldSeals = splitSeals(before?.['dgda_seal_no']);
      const toReserve = newSeals.filter((s) => !oldSeals.includes(s));
      const toRelease = oldSeals.filter((s) => !newSeals.includes(s));
      const mcaRef = String(patch['mca_ref'] ?? before?.['mca_ref'] ?? savedId);
      if (toRelease.length > 0) {
        await tx.update(sealNumber)
          .set({ status: 'Available', notes: null, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
          .where(and(inArray(sealNumber.sealNumber, toRelease), eq(sealNumber.status, 'Used')));
      }
      if (toReserve.length > 0) {
        await tx.update(sealNumber)
          .set({ status: 'Used', notes: `Export ${mcaRef}`, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
          .where(and(inArray(sealNumber.sealNumber, toReserve), eq(sealNumber.status, 'Available')));
      }
    }

    // §4.10: audit row, same transaction.
    await recordAudit(tx, {
      actorId: session.uid,
      action: isCreate ? 'create' : 'update',
      entityType: `page:${slug}`,
      entityId: String(savedId),
      before,
      after: patch,
      metadata: {
        accordion: accordionSlug,
        // For per-field reconstruction in the audit detail UI.
        fields: Object.keys(patch),
      },
    });

    return savedId;
  });

  return ok({ id: newId }, isCreate ? 201 : 200);
}

// Convenience GET so the client can refresh values for a specific accordion
// without re-fetching the whole page structure. Same role check as POST.
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { slug, id: rawId } = await params;
  if (rawId === 'new') return ok({ values: {} });

  const entityId = Number(rawId);
  if (Number.isNaN(entityId)) return fail('Invalid entity id', 400);

  const { searchParams } = new URL(req.url);
  const accordionSlug = searchParams.get('accordion_slug');

  // If a specific accordion is requested, scope columns to that accordion;
  // otherwise return all whitelisted fields the user can see.
  let fieldNames: string[];
  if (accordionSlug) {
    const grants = await db
      .select({ accordion_id: masterPageAccordion.id })
      .from(masterPage)
      .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
      .innerJoin(
        masterPageAccordionRole,
        eq(masterPageAccordionRole.accordionId, masterPageAccordion.id),
      )
      .where(
        and(
          eq(masterPage.slug, slug),
          eq(masterPageAccordion.slug, accordionSlug),
          eq(masterPageAccordionRole.roleId, session.role_id),
        ),
      )
      .limit(1);
    if (grants.length === 0) return fail('Forbidden', 403);
    const fields = await db
      .select({ name: masterPageAccordionField.name })
      .from(masterPageAccordionField)
      .where(eq(masterPageAccordionField.accordionId, grants[0].accordion_id));
    fieldNames = fields.map((f) => f.name);
  } else {
    const grants = await db
      .select({ accordion_id: masterPageAccordion.id })
      .from(masterPage)
      .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
      .innerJoin(
        masterPageAccordionRole,
        eq(masterPageAccordionRole.accordionId, masterPageAccordion.id),
      )
      .where(
        and(
          eq(masterPage.slug, slug),
          eq(masterPageAccordionRole.roleId, session.role_id),
        ),
      );
    if (grants.length === 0) return fail('Forbidden', 403);
    const accordionIds = grants.map((g) => g.accordion_id);
    const fields = await db
      .select({ name: masterPageAccordionField.name })
      .from(masterPageAccordionField)
      .where(inArray(masterPageAccordionField.accordionId, accordionIds));
    fieldNames = fields.map((f) => f.name);
  }

  const safeColumns = safeColumnsFor(slug, fieldNames);
  const values = await fetchEntityValues(slug, entityId, safeColumns);
  if (!values) return fail('Entity not found', 404);
  return ok({ values });
}
