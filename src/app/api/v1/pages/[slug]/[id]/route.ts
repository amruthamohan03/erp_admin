// §4.12 — POST changes to the page's target entity. §4.17 — a transaction page has
// ONE save, so the normal request carries every editable accordion at once and this
// route commits them as a single INSERT/UPDATE.
// §4.10 — the write + audit_log insert share one Drizzle transaction.
//
// Request body — the page-level form:
//   { accordions: [ { slug: 'basic', values: {...} }, { slug: 'contact', values: {...} } ] }
//
// Single-accordion shape, still accepted so API-only callers don't break:
//   { accordion_slug: 'basic', values: {...} }
//
// - 'new' as the path id creates the entity. Because every accordion arrives in one
//   request, the create is a single INSERT carrying the whole form — no
//   "first accordion creates, the rest update" sequencing, and no half-written row
//   if a later section fails validation.
// - Existing id: partial UPDATE limited to columns owned by the named accordions.
//
// Each accordion's values are filtered against ITS OWN field list (server-side
// whitelist), so untrusted keys can't slip extra columns in, and a field cannot be
// written through an accordion that doesn't own it.
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
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { fetchEntityValues, getPageTarget, safeColumnsFor } from '@/lib/pages/targets';
import { effectiveFieldPermission, fetchFieldOverrides } from '@/lib/pages/fieldGrants';
import { recordAudit } from '@/lib/audit/recordAudit';
import { parseConditions, resolveFieldState, checkBounds } from '@/lib/pages/conditions';
import { parseDerive, isPureDerive, computePureDerive } from '@/lib/pages/derive';
import { assertImportPartielleCapacity } from '@/db/queries/partielle';
import { assertPaymentMcaRefs, firstMcaRef } from '@/db/queries/paymentMca';

type Ctx = { params: Promise<{ slug: string; id: string }> };

// Wrapped so an unexpected throw comes back as the {ok:false,error} envelope
// (§4.4). Unwrapped, Next answers with an empty-bodied 500 and the caller's
// res.json() dies with "unexpected end of JSON input", hiding the real cause.
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { slug, id: rawId } = await params;

  const target = getPageTarget(slug);
  if (!target) return fail('Unknown page', 404);

  let body: {
    accordions?: Array<{ slug?: string; values?: Record<string, unknown> }>;
    accordion_slug?: string;
    values?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  // Normalise both request shapes to one list so the rest of the handler has a
  // single code path (§4.10).
  const submitted: Array<{ slug: string; values: Record<string, unknown> }> = [];
  if (Array.isArray(body.accordions)) {
    for (const entry of body.accordions) {
      if (!entry?.slug || typeof entry.slug !== 'string') {
        return fail('Each accordion needs a slug', 422);
      }
      submitted.push({ slug: entry.slug, values: entry.values ?? {} });
    }
  } else if (typeof body.accordion_slug === 'string' && body.accordion_slug) {
    submitted.push({ slug: body.accordion_slug, values: body.values ?? {} });
  }
  if (submitted.length === 0) {
    return fail('accordions (or accordion_slug) is required', 422);
  }
  const submittedSlugs = submitted.map((a) => a.slug);
  if (new Set(submittedSlugs).size !== submittedSlugs.length) {
    return fail('Duplicate accordion slug in request', 422);
  }

  // 1) Resolve the page + every named accordion + this role's permission on each.
  const rows = await db
    .select({
      page_id: masterPage.id,
      page_target: masterPage.targetTable,
      accordion_id: masterPageAccordion.id,
      accordion_slug: masterPageAccordion.slug,
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
        inArray(masterPageAccordion.slug, submittedSlugs),
        eq(masterPageAccordion.display, 'Y'),
        eq(masterPageAccordionRole.roleId, session.role_id),
      ),
    );

  const grantBySlug = new Map(rows.map((r) => [r.accordion_slug, r]));
  for (const entry of submitted) {
    const g = grantBySlug.get(entry.slug);
    if (!g) return fail(`Forbidden — accordion "${entry.slug}" is not visible to your role`, 403);
    if (g.permission !== 'edit') {
      return fail(`Forbidden — read-only access to accordion "${entry.slug}"`, 403);
    }
  }

  // Values are keyed by the accordion that submitted them, so step 4 can reject a
  // field pushed through an accordion that doesn't own it.
  const valuesByAccordionId = new Map<number, Record<string, unknown>>(
    submitted.map((entry) => [grantBySlug.get(entry.slug)!.accordion_id, entry.values]),
  );
  const accordionIds = Array.from(valuesByAccordionId.keys());

  // 2) Fetch the field definitions for these accordions to build a whitelist.
  const fields = await db
    .select({
      id: masterPageAccordionField.id,
      accordion_id: masterPageAccordionField.accordionId,
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
        inArray(masterPageAccordionField.accordionId, accordionIds),
        eq(masterPageAccordionField.display, 'Y'),
      ),
    )
    .orderBy(asc(masterPageAccordionField.displayOrder));

  if (fields.length === 0) return fail('No fields configured on the submitted accordions', 500);

  // §4.14 — resolve each field's effective permission for this role; only fields
  // that resolve to 'edit' may be written (absence of an override ⇒ inherit the
  // owning accordion's 'edit', i.e. the prior behavior).
  const overrides = await fetchFieldOverrides(fields.map((f) => f.id), session.role_id);
  const permissionByAccordionId = new Map(rows.map((r) => [r.accordion_id, r.permission]));
  const editableNames = new Set<string>();
  for (const f of fields) {
    const accordionPermission = permissionByAccordionId.get(f.accordion_id) as 'view' | 'edit';
    if (effectiveFieldPermission(accordionPermission, overrides.get(f.id)) === 'edit') {
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

  // Merged across every submitted accordion: with one page-level save, a condition
  // that references a field in another section sees that section's *new* value in
  // the same request rather than the stale stored one.
  const mergedSubmitted: Record<string, unknown> = Object.assign({}, ...submitted.map((a) => a.values));
  const evalContext: Record<string, unknown> = { ...(before ?? {}), ...mergedSubmitted };

  // 4) Restrict the incoming values to (editable ∩ owning accordion ∩ target
  //    columns), and drop any field that resolves to hidden or read-only.
  const safeColumnSet = new Set(safeColumnsFor(slug, fields.map((f) => f.name)));

  const patch: Record<string, unknown> = {};
  for (const f of fields) {
    if (!safeColumnSet.has(f.name) || !editableNames.has(f.name)) continue;
    // Only the accordion that owns the field may supply its value.
    const ownerValues = valuesByAccordionId.get(f.accordion_id) ?? {};
    if (!(f.name in ownerValues)) continue;
    const state = resolveFieldState(parseConditions(f.conditions), f.required, evalContext);
    // A field the rules hide or freeze must not be written from this request.
    if (!state.visible || state.readonly) continue;
    patch[f.name] = ownerValues[f.name];
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
      // "Required" means the entity ENDS UP with a value — judged against the patch
      // first, then the merged context (stored row + this submission). A page-level
      // save validates every accordion, so a required field that is legitimately
      // absent from the patch — read-only, or derived — must not fail on that
      // alone. This reads context only; nothing extra gets written.
      const v = f.name in patch ? patch[f.name] : evalContext[f.name];
      // An array-valued field (the payment reference grid) is empty when it has
      // no rows — `[]` is a value, but not one that satisfies `required`.
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) return fail(`Required field missing: ${f.label}`, 422, { field: f.name });
    }
    const boundError = checkBounds(state, f.label, mergedSubmitted[f.name]);
    if (boundError) return fail(boundError, 422, { field: f.name });
  }

  // §5 C-02 — an import file must fit inside its selected PARTIELLE allotment.
  // Enforced here (not in the generic write) because the budget rule is
  // import-specific, exactly as the export seal-reservation below is export-
  // specific. Uses the merged (before + submitted) values so a weight/fob change
  // on any accordion is re-checked against the allotment.
  if (slug === 'import') {
    const partielleError = await assertImportPartielleCapacity(evalContext, entityId);
    if (partielleError) return fail(partielleError, 422, { field: 'inspection_reports' });
  }

  // A payment request's references must exist in the tracking table for its
  // client and must not already be consumed by another request with the same
  // expense type. Page-specific like the two rules above, and enforced here so a
  // direct API call gets the same answer as the grid's live check.
  if (slug === 'payment' && 'mca_data' in patch) {
    const mcaError = await assertPaymentMcaRefs(evalContext, entityId);
    if (mcaError) return fail(mcaError, 422, { field: 'mca_data' });
    // Keep the denormalised first reference in step with the grid. Written from
    // code rather than from a configured field, so it is not part of the
    // whitelist above — the column name is a literal, never client input.
    patch['mca_ref'] = firstMcaRef(patch['mca_data']);
  }

  // 7) Transactional write + audit.
  const write = async (): Promise<number> => db.transaction(async (tx) => {
    // Apply the partial update / insert. We build the SQL dynamically because
    // the column set is data-driven — but every identifier comes from the
    // whitelisted `safeColumns` set, so this is safe.
    let savedId: number;

    if (isCreate) {
      // Omit the columns the form left empty so their DB defaults apply. Passing
      // an explicit NULL DEFEATS a column default — Postgres only falls back to
      // the default when the column is absent from the INSERT. Listing every
      // configured field unconditionally therefore made any optional field whose
      // column is NOT NULL DEFAULT <x> impossible to leave blank (client_master_t
      // .invoice_template DEFAULT 'I' was one), failing the whole create.
      // Updates still write NULL, because clearing a field has to stay possible.
      const provided = Object.keys(patch).filter((c) => patch[c] !== null && patch[c] !== undefined);
      // Always set created_by + updated_by on inserts; the entity table requires
      // them in practice.
      const cols = [...provided, 'created_by', 'updated_by'];
      const vals = [
        ...provided.map((c) => sql`${patch[c]}`),
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
        // `accordion` stays singular for back-compat with existing audit rows and
        // the detail UI; `accordions` carries the full set a page-level save wrote.
        accordion: submittedSlugs[0],
        accordions: submittedSlugs,
        // For per-field reconstruction in the audit detail UI.
        fields: Object.keys(patch),
      },
    });

    return savedId;
  });

  // A unique index on the target table (e.g. license_t's partial unique on
  // license_number) would otherwise surface as an unhandled 500. Translate it into
  // the same shape a validation failure uses, so the UI can open the offending
  // section and mark the field instead of showing a raw database error.
  let newId: number;
  try {
    newId = await write();
  } catch (err) {
    const conflictColumn = uniqueViolationColumn(err, Object.keys(patch));
    if (!conflictColumn) throw err;
    const label = fields.find((f) => f.name === conflictColumn)?.label ?? conflictColumn;
    return fail(`${label} must be unique — that value is already in use.`, 409, {
      field: conflictColumn,
    });
  }

  return ok({ id: newId }, isCreate ? 201 : 200);
});

/**
 * The column a Postgres unique violation (23505) landed on, or null if the error
 * is something else. Matched by looking for a written column name inside the
 * constraint name (`uq_license_t_license_number` → `license_number`); the longest
 * match wins so a column that is a suffix of another can't shadow it.
 */
function uniqueViolationColumn(err: unknown, writtenColumns: string[]): string | null {
  const chain: unknown[] = [err, (err as { cause?: unknown })?.cause];
  for (const candidate of chain) {
    const e = candidate as { code?: string; constraint?: string; detail?: string } | undefined;
    if (e?.code !== '23505') continue;
    const haystack = `${e.constraint ?? ''} ${e.detail ?? ''}`;
    const hits = writtenColumns
      .filter((col) => haystack.includes(col))
      .sort((a, b) => b.length - a.length);
    return hits[0] ?? null;
  }
  return null;
}

// Convenience GET so the client can refresh values for a specific accordion
// without re-fetching the whole page structure. Same role check as POST.
export const GET = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
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
});
