// §8 Export Bulk Update service — the export twin of importBulk.ts.
//
// Row selection reuses the shared dashboard predicates (exportFilters.ts) so the
// bulk modal, the status cards and the grid can never disagree about which rows
// are "pending". The write validates per field type, refuses a milestone date
// that precedes the loading date, and runs as ONE transaction — any failure
// rolls the whole batch back naming the offending row, because a mass edit that
// half-applied leaves nobody able to say where it stopped.
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, clientMaster } from '@/db/schema';
import { exportFilterCondition } from '@/db/queries/exportFilters';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  BULK_WHITELIST,
  FIELD_META,
  relevantFieldsFor,
  readonlyFieldsFor,
} from '@/lib/exports/bulkFields';

const BULK_LIMIT = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BulkExtra {
  client_id?: number;
  transport_mode_id?: number;
  loading_from?: string;
  loading_to?: string;
}

export interface BulkUpdateData {
  relevant_fields: string[];
  readonly_fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

// Identity + every bulk-editable column + truck identity. Fixed projection so
// the modal always receives the same shape whichever filter is active.
function bulkSelect() {
  return {
    id: exportT.id,
    mca_ref: exportT.mcaRef,
    client_name: clientMaster.shortName,
    loading_date: exportT.loadingDate,
    ceec_in_date: exportT.ceecInDate,
    ceec_out_date: exportT.ceecOutDate,
    min_div_in_date: exportT.minDivInDate,
    min_div_out_date: exportT.minDivOutDate,
    gov_docs_in_date: exportT.govDocsInDate,
    gov_docs_out_date: exportT.govDocsOutDate,
    audited_date: exportT.auditedDate,
    archived_date: exportT.archivedDate,
    archive_reference: exportT.archiveReference,
    dgda_in_date: exportT.dgdaInDate,
    declaration_reference: exportT.declarationReference,
    liquidation_date: exportT.liquidationDate,
    liquidation_reference: exportT.liquidationReference,
    quittance_date: exportT.quittanceDate,
    quittance_reference: exportT.quittanceReference,
    dispatch_deliver_date: exportT.dispatchDeliverDate,
    dgda_seal_no: exportT.dgdaSealNo,
    number_of_seals: exportT.numberOfSeals,
    lmc_id: exportT.lmcId,
    lmc_date: exportT.lmcDate,
    ogefrem_inv_ref: exportT.ogefremInvRef,
    ogefrem_date: exportT.ogefremDate,
    horse: exportT.horse,
    trailer_1: exportT.trailer1,
    trailer_2: exportT.trailer2,
    container: exportT.container,
  };
}

function bulkWhere(filterKeys: string[], extra: BulkExtra): SQL {
  const conds: SQL[] = [sql`${exportT.display} = 'Y'`];
  for (const key of filterKeys) {
    const c = exportFilterCondition(key);
    if (c) conds.push(c);
  }
  if (extra.client_id) conds.push(sql`${exportT.clientId} = ${extra.client_id}`);
  if (extra.transport_mode_id) conds.push(sql`${exportT.transportMode} = ${extra.transport_mode_id}`);
  if (extra.loading_from) conds.push(sql`${exportT.loadingDate} >= ${extra.loading_from}`);
  if (extra.loading_to) conds.push(sql`${exportT.loadingDate} <= ${extra.loading_to}`);
  return and(...conds) as SQL;
}

export async function bulkUpdateData(
  filterKeys: string[],
  extra: BulkExtra,
): Promise<BulkUpdateData> {
  const relevant = relevantFieldsFor(filterKeys);
  // No pending filter active ⇒ nothing to fill in. The modal reads this as "pick
  // a status card first" rather than opening on every export in the system.
  if (relevant.length === 0) {
    return { relevant_fields: [], readonly_fields: [], rows: [], truncated: false };
  }
  const where = bulkWhere(filterKeys, extra);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(exportT)
    .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
    .where(where);

  const rows = await db
    .select(bulkSelect())
    .from(exportT)
    .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
    .where(where)
    .orderBy(asc(exportT.loadingDate), asc(exportT.id))
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

/** Comma-joined seal numbers → count, the rule the single form applies via its `count` derive. */
const sealCount = (s: unknown): number =>
  String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean).length;

/**
 * Clean and validate one submitted value against its type and the row's loading
 * date. Returns what to write, or throws with a message naming the field (§4.23).
 */
function cleanField(field: string, raw: unknown, loadingDate: string | null): string | number | null {
  const meta = FIELD_META[field];
  const s = raw === null || raw === undefined ? '' : String(raw).trim();
  if (s === '') return null; // empty clears the column

  if (meta?.type === 'date') {
    if (!DATE_RE.test(s)) throw new BulkUpdateError(`${meta.label}: not a valid date`);
    // A customs milestone cannot happen before the truck loaded. Catching it here
    // beats a date that reads plausibly and quietly breaks the delay KPIs.
    if (loadingDate && s < loadingDate) {
      throw new BulkUpdateError(`${meta.label}: cannot precede the loading date (${loadingDate})`);
    }
    return s;
  }
  if (meta?.type === 'number') {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      throw new BulkUpdateError(`${meta?.label ?? field}: must be a non-negative number`);
    }
    return n;
  }
  return s;
}

export async function applyBulkUpdate(
  updates: BulkRowUpdate[],
  uid: number,
): Promise<{ success_count: number }> {
  if (updates.length === 0) return { success_count: 0 };

  const ids = updates.map((u) => u.id);
  const stored = await db
    .select(bulkSelect())
    .from(exportT)
    .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
    .where(and(eq(exportT.display, 'Y'), sql`${exportT.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  const byId = new Map(stored.map((r) => [r.id, r]));

  // Build and validate EVERY patch before writing anything — all-or-nothing, and
  // the operator is told which row is wrong rather than finding out afterwards.
  const patches: { id: number; ref: string; patch: Record<string, string | number | null> }[] = [];
  updates.forEach((u, i) => {
    const row = byId.get(u.id);
    if (!row) throw new BulkUpdateError(`Row ${i + 1}: export #${u.id} not found`);
    const ref = (row.mca_ref as string | null) ?? `#${u.id}`;
    const loadingDate = (row.loading_date as string | null) ?? null;

    const patch: Record<string, string | number | null> = {};
    for (const [field, raw] of Object.entries(u.values)) {
      if (!BULK_WHITELIST.has(field)) continue; // whitelist — drop unknown columns
      try {
        patch[field] = cleanField(field, raw, loadingDate);
      } catch (e) {
        const detail = e instanceof BulkUpdateError ? e.message : 'invalid value';
        throw new BulkUpdateError(`Row ${i + 1} (${ref}): ${detail}`);
      }
    }

    // No. of Seals is derived, never submitted — recomputed here so a bulk edit
    // and a single-record save leave the row in the same state.
    if ('dgda_seal_no' in patch) {
      patch['number_of_seals'] = patch['dgda_seal_no'] === null ? null : sealCount(patch['dgda_seal_no']);
    }

    if (Object.keys(patch).length > 0) patches.push({ id: u.id, ref, patch });
  });

  if (patches.length === 0) return { success_count: 0 };

  await db.transaction(async (tx) => {
    for (const { id, patch } of patches) {
      const sets = Object.entries(patch).map(([c, v]) => sql`${sql.identifier(c)} = ${v}`);
      sets.push(sql`${sql.identifier('updated_by')} = ${uid}`);
      sets.push(sql`updated_at = CURRENT_TIMESTAMP`);
      await tx.execute(sql`UPDATE exports_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
    }

    // §4.28 — one entry for the batch, which is the unit the operator performed.
    // The references it touched are recorded so a single record still traces back.
    await recordAudit(tx, {
      actorId: uid,
      actorType: 'user',
      action: 'update',
      entityType: 'export:bulk',
      entityId: 'bulk',
      after: { updated: patches.length, references: patches.map((p) => p.ref) },
      metadata: { source: 'export-bulk-update', fields: [...new Set(patches.flatMap((p) => Object.keys(p.patch)))] },
    });
  });

  return { success_count: patches.length };
}
