// §9 Bulk Update service. Row selection reuses the shared dashboard predicates
// (importFilters.ts) so the bulk modal, the cards and the grid all agree. The
// write validates per the doc §9.1 (dates parse + not before pre-alert; numerics
// non-negative; empty ⇒ NULL), recomputes document + clearing status from the
// same config derives the single-record save uses, and runs as one transaction —
// any failure rolls the whole batch back (naming the offending row).
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
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

const BULK_LIMIT = 2000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BulkExtra {
  client_id?: number;
  pre_alert_from?: string;
  pre_alert_to?: string;
}

export interface BulkUpdateData {
  relevant_fields: string[];
  readonly_fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

// The fixed projection: identity + every bulk-editable column + truck identity +
// the derive-driving dates (pre-alert for validation, border arrival for clearing).
function bulkSelect() {
  return {
    id: importT.id,
    mca_ref: importT.mcaRef,
    client_name: clientMaster.companyName,
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
  if (extra.pre_alert_from) conds.push(sql`${importT.preAlertDate} >= ${extra.pre_alert_from}`);
  if (extra.pre_alert_to) conds.push(sql`${importT.preAlertDate} <= ${extra.pre_alert_to}`);
  return and(...conds) as SQL;
}

export async function bulkUpdateData(filterKeys: string[], extra: BulkExtra): Promise<BulkUpdateData> {
  const relevant = relevantFieldsFor(filterKeys);
  if (relevant.length === 0) {
    return { relevant_fields: [], readonly_fields: [], rows: [], truncated: false };
  }
  const where = bulkWhere(filterKeys, extra);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .where(where);

  const rows = await db
    .select(bulkSelect())
    .from(importT)
    .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
    .where(where)
    .orderBy(asc(importT.preAlertDate), asc(importT.id))
    .limit(BULK_LIMIT);

  return {
    relevant_fields: relevant,
    readonly_fields: readonlyFieldsFor(filterKeys),
    rows,
    truncated: Number(total) > BULK_LIMIT,
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
    .where(and(eq(importT.display, 'Y'), sql`${importT.id} = ANY(${ids})`));
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
