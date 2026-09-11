// §9 Bulk Update service. Row selection reuses the shared dashboard predicates
// (importFilters.ts) so the bulk modal, the cards and the grid all agree. The
// write validates per the doc §9.1 (dates parse + not before pre-alert; numerics
// non-negative; empty ⇒ NULL), recomputes document + clearing status from the
// same config derives the single-record save uses, and runs as one transaction —
// any failure rolls the whole batch back (naming the offending row).
import { and, asc, eq, sql, type SQL, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  importT,
  clientMaster,
  masterPage,
  masterPageAccordion,
  masterPageAccordionField,
} from '@/db/schema';
import { importFilterCondition } from '@/db/queries/importFilters';
import { parseDerive, isPureDerive, computePureDerive } from '@/lib/pages/derive';
import { BULK_WHITELIST, FIELD_META, relevantFieldsFor, readonlyFieldsFor } from '@/lib/imports/bulkFields';

// One page of rows at a time (§4.9). Same numbers as the export twin, so the two
// bulk screens page identically.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BulkExtra {
  client_id?: number;
  transport_mode_id?: number;
  type_of_goods_id?: number;
  pre_alert_from?: string;
  pre_alert_to?: string;
  /** Free-text narrowing over identity columns — see bulkWhere. */
  q?: string;
}

export interface BulkUpdateData {
  relevant_fields: string[];
  readonly_fields: string[];
  rows: Record<string, unknown>[];
  /** Server-side paging — the modal edits one page at a time (§4.9). */
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// The fixed projection: identity + every bulk-editable column + truck identity +
// the derive-driving dates (pre-alert for validation, border arrival for clearing).
function bulkSelect() {
  return {
    id: importT.id,
    mca_ref: importT.mcaRef,
    // The short code, matching the export twin and the client picker above the
    // grid (§4.15). A 200-character legal name is unreadable in a 15-column grid,
    // and a column that disagreed with the filter above it reads as a bug.
    client_name: clientMaster.shortName,
    pre_alert_date: importT.preAlertDate,
    crf_reference: importT.crfReference,
    crf_received_date: importT.crfReceivedDate,
    ad_date: importT.adDate,
    insurance_date: importT.insuranceDate,
    insurance_amount: importT.insuranceAmount,
    insurance_reference: importT.insuranceReference,
    audited_date: importT.auditedDate,
    archived_date: importT.archivedDate,
    archive_reference: importT.archiveReference,
    dgda_in_date: importT.dgdaInDate,
    declaration_reference: importT.declarationReference,
    liquidation_date: importT.liquidationDate,
    liquidation_reference: importT.liquidationReference,
    quittance_date: importT.quittanceDate,
    quittance_reference: importT.quittanceReference,
    dgda_out_date: importT.dgdaOutDate,
    warehouse_arrival_date: importT.warehouseArrivalDate,
    warehouse_departure_date: importT.warehouseDepartureDate,
    dispatch_deliver_date: importT.dispatchDeliverDate,
    border_warehouse_arrival_date: importT.borderWarehouseArrivalDate,
    horse: importT.horse,
    trailer_1: importT.trailer1,
    trailer_2: importT.trailer2,
    container: importT.container,
  };
}

function bulkWhere(filterKeys: string[], extra: BulkExtra): SQL {
  const conds: SQL[] = [sql`${importT.display} = 'Y'`];
  for (const key of filterKeys) {
    const c = importFilterCondition(key);
    if (c) conds.push(c);
  }
  if (extra.client_id) conds.push(sql`${importT.clientId} = ${extra.client_id}`);
  if (extra.transport_mode_id) conds.push(sql`${importT.transportMode} = ${extra.transport_mode_id}`);
  if (extra.type_of_goods_id) conds.push(sql`${importT.typeOfGoods} = ${extra.type_of_goods_id}`);
  if (extra.pre_alert_from) conds.push(sql`${importT.preAlertDate} >= ${extra.pre_alert_from}`);
  if (extra.pre_alert_to) conds.push(sql`${importT.preAlertDate} <= ${extra.pre_alert_to}`);

  // Searched HERE, not over the loaded page — with server-side paging a
  // client-side filter only sees the 50 rows on screen and would report "no
  // matches" for a truck three pages away.
  const q = extra.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(sql`(
      ${importT.mcaRef} ILIKE ${like}
      OR ${clientMaster.shortName} ILIKE ${like}
      OR ${clientMaster.companyName} ILIKE ${like}
      OR ${importT.horse} ILIKE ${like}
      OR ${importT.trailer1} ILIKE ${like}
      OR ${importT.trailer2} ILIKE ${like}
      OR ${importT.container} ILIKE ${like}
    )`);
  }
  return and(...conds) as SQL;
}

/**
 * One page of rows to bulk-edit.
 *
 * Paged server-side rather than fetched whole (§4.9): a "pending" filter can
 * match every import on the system, and pulling up to 2000 rows — each rendering
 * several inputs — into one DOM made the modal slow to open and slow to type in.
 */
export async function bulkUpdateData(
  filterKeys: string[],
  extra: BulkExtra,
  paging: { page?: number; pageSize?: number } = {},
): Promise<BulkUpdateData> {
  const pageSize = Math.min(Math.max(paging.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const relevant = relevantFieldsFor(filterKeys);
  if (relevant.length === 0) {
    return {
      relevant_fields: [],
      readonly_fields: [],
      rows: [],
      page: 1,
      page_size: pageSize,
      total: 0,
      total_pages: 1,
    };
  }
  const where = bulkWhere(filterKeys, extra);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(Number(total) / pageSize));
  // Clamped rather than trusted: a page past the end (the filter narrowed while
  // the modal was open) returns the last page instead of nothing at all.
  const page = Math.min(Math.max(paging.page ?? 1, 1), totalPages);

  const rows = await db
    .select(bulkSelect())
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .where(where)
    // id last so the order is total — two imports pre-alerted the same day would
    // otherwise page unstably and a row could be seen twice or missed.
    .orderBy(asc(importT.preAlertDate), asc(importT.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    relevant_fields: relevant,
    readonly_fields: readonlyFieldsFor(filterKeys),
    rows,
    page,
    page_size: pageSize,
    total: Number(total),
    total_pages: totalPages,
  };
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------
export class BulkUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkUpdateError';
  }
}

export interface BulkRowUpdate {
  id: number;
  values: Record<string, unknown>;
}

// Config derives for the two recomputed statuses (single source of truth with
// the per-record save). Cached per process.
let deriveCache: { document?: unknown; clearing?: unknown } | null = null;
async function statusDerives(): Promise<{ document?: unknown; clearing?: unknown }> {
  if (deriveCache) return deriveCache;
  const rows = await db
    .select({ name: masterPageAccordionField.name, derive: masterPageAccordionField.derive })
    .from(masterPageAccordionField)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.id, masterPageAccordionField.accordionId))
    .innerJoin(masterPage, eq(masterPage.id, masterPageAccordion.pageId))
    .where(and(eq(masterPage.slug, 'import'), eq(masterPageAccordion.display, 'Y')));
  const out: { document?: unknown; clearing?: unknown } = {};
  for (const r of rows) {
    if (r.name === 'document_status') out.document = r.derive;
    if (r.name === 'clearing_status') out.clearing = r.derive;
  }
  deriveCache = out;
  return out;
}

// Clean + validate one field's submitted value against its type and the row's
// pre-alert floor. Returns the value to write (string|number|null) or throws.
function cleanField(field: string, raw: unknown, preAlert: string | null): string | number | null {
  const meta = FIELD_META[field];
  const s = raw === null || raw === undefined ? '' : String(raw).trim();
  if (s === '') return null; // empty clears the column
  if (meta?.type === 'date') {
    if (!DATE_RE.test(s)) throw new BulkUpdateError(`${meta.label}: not a valid date`);
    if (preAlert && s < preAlert) throw new BulkUpdateError(`${meta.label}: cannot precede the pre-alert date (${preAlert})`);
    return s;
  }
  if (meta?.type === 'number') {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new BulkUpdateError(`${meta?.label ?? field}: must be a non-negative number`);
    return n;
  }
  return s;
}

export async function applyBulkUpdate(updates: BulkRowUpdate[], uid: number): Promise<{ success_count: number }> {
  if (updates.length === 0) return { success_count: 0 };

  const ids = updates.map((u) => u.id);
  // Stored driving values, keyed by id (dates come back as strings from the builder).
  const stored = await db
    .select(bulkSelect())
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    // `inArray`, not `= ANY(${ids})`. Drizzle expands a JS array in the `sql`
    // tag into a parenthesised parameter LIST, so `ANY(($1))` handed Postgres a
    // bare `1` where an array literal belonged (22P02) and two ids gave 42809
    // "requires array on right side" — Bulk Update could not save at all. Same
    // trap as the payment reference check; see textList in paymentMca.ts.
    .where(and(eq(importT.display, 'Y'), inArray(importT.id, ids)));
  const byId = new Map(stored.map((r) => [r.id, r]));

  const derives = await statusDerives();
  const docSpec = parseDerive(derives.document);
  const clrSpec = parseDerive(derives.clearing);

  // Build + validate every patch BEFORE writing (all-or-nothing, doc §9.1).
  const patches: { id: number; patch: Record<string, string | number | null> }[] = [];
  updates.forEach((u, i) => {
    const row = byId.get(u.id);
    if (!row) throw new BulkUpdateError(`Row ${i + 1}: import #${u.id} not found`);
    const preAlert = (row.pre_alert_date as string | null) ?? null;

    const patch: Record<string, string | number | null> = {};
    for (const [field, raw] of Object.entries(u.values)) {
      if (!BULK_WHITELIST.has(field)) continue; // whitelist — drop unknown columns
      try {
        patch[field] = cleanField(field, raw, preAlert);
      } catch (e) {
        const label = e instanceof BulkUpdateError ? e.message : 'invalid value';
        throw new BulkUpdateError(`Row ${i + 1} (${row.mca_ref ?? `#${u.id}`}): ${label}`);
      }
    }

    // Recompute statuses from stored merged with the submission.
    const merged = { ...row, ...patch };
    if (isPureDerive(docSpec)) {
      const v = computePureDerive(docSpec, merged);
      if (v !== undefined) patch['document_status'] = v as number;
    }
    if (isPureDerive(clrSpec)) {
      const v = computePureDerive(clrSpec, merged);
      if (v !== undefined) patch['clearing_status'] = v as number;
    }
    patches.push({ id: u.id, patch });
  });

  await db.transaction(async (tx) => {
    for (const { id, patch } of patches) {
      const sets = Object.entries(patch).map(([c, v]) => sql`${sql.identifier(c)} = ${v}`);
      sets.push(sql`${sql.identifier('updated_by')} = ${uid}`);
      sets.push(sql`updated_at = CURRENT_TIMESTAMP`);
      await tx.execute(sql`UPDATE imports_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
    }
  });

  return { success_count: patches.length };
}
