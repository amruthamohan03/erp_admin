// §3 Sydonia bulk-update — an Excel of MCA refs patches declaration / liquidation
// / quittance milestones onto existing tracking rows (imports_t or exports_t).
// Ports importsydonia / exportsydonia: match by MCA ref (case/space-insensitive),
// update only the non-empty columns, never insert. Both kinds share every column
// name, so one code path handles them via the table identifier (§4.10).
//
// This file owns the SQL only. What a row MEANS — which cells parse, why a
// reference is rejected — lives in src/lib/sydonia.ts, so those rules are
// testable without a database (§4.10, the same split as actionStyles).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  cleanDate,
  normalizeRef,
  type RefMatch,
  type SydoniaKind,
  type SydoniaRow,
} from '@/lib/sydonia';

const TABLE: Record<SydoniaKind, string> = { import: 'imports_t', export: 'exports_t' };

/**
 * Look every reference up, INCLUDING soft-deleted ones.
 *
 * Deleted rows are returned rather than filtered out because "not in the
 * database" and "in the Recycle Bin" are different problems with different
 * fixes, and reporting the second as the first sends an operator hunting for a
 * record that is actually still there (§4.23, §4.27). Keyed by the normalised
 * ref, so a trailing space or lower case in the sheet still matches.
 */
export async function lookupMcaRefs(
  kind: SydoniaKind,
  refs: string[],
): Promise<Map<string, RefMatch>> {
  const normalized = [...new Set(refs.map(normalizeRef).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  // IN over an explicit parameter list, not `= ANY($1)`. Drizzle's sql tag
  // expands a JS array into `($1, $2, $3)` — a record, not an array — so the ANY
  // form this query used to carry threw "op ANY/ALL (array) requires array on
  // right side" on EVERY upload, and no reference ever matched.
  const list = sql.join(normalized.map((n) => sql`${n}`), sql`, `);

  const res = await db.execute(sql`
    SELECT id, upper(trim(mca_ref)) AS k, display
    FROM ${sql.identifier(TABLE[kind])}
    WHERE upper(trim(mca_ref)) IN (${list})
    -- A visible row wins over a deleted one carrying the same reference, so a
    -- restored-and-reissued pair reports as updatable rather than as deleted.
    ORDER BY (display = 'Y') DESC, id DESC`);

  const rows = (res as unknown as { rows: { id: number; k: string; display: string }[] }).rows;
  const out = new Map<string, RefMatch>();
  for (const r of rows) {
    if (!out.has(r.k)) out.set(r.k, { id: r.id, display: r.display === 'Y' ? 'Y' : 'N' });
  }
  return out;
}

export interface SydoniaUpdateResult {
  updated: number;
  failed: number;
  /** The references actually written, for the completion summary. */
  updatedRefs: string[];
  errors: string[];
}

/**
 * Patch each row: only non-empty fields are written, and nothing is ever inserted.
 *
 * The whole batch runs in ONE transaction (§7.3): a file is a single operator
 * action, and a run that dies half way through — 200 records patched, 300 not —
 * is the worst outcome, because nothing on the outside says where it stopped.
 *
 * Values are re-parsed here rather than trusted from the preview, so a stale or
 * tampered client payload cannot write something validation never approved.
 */
export async function applySydoniaUpdates(
  kind: SydoniaKind,
  rows: SydoniaRow[],
  uid: number,
): Promise<SydoniaUpdateResult> {
  let updated = 0;
  let failed = 0;
  const updatedRefs: string[] = [];
  const errors: string[] = [];
  const table = sql.identifier(TABLE[kind]);

  // The preview promised that only the FIRST row for a reference is applied;
  // honour that here too rather than letting a duplicate silently win.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = normalizeRef(r.mca_ref);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await db.transaction(async (tx) => {
    for (const r of unique) {
      const mca = (r.mca_ref ?? '').trim();

      const sets = [];
      if (r.declaration_reference?.trim()) sets.push(sql`declaration_reference = ${r.declaration_reference.trim()}`);
      const dgda = cleanDate(r.declaration_date);
      if (dgda) sets.push(sql`dgda_in_date = ${dgda}`);
      if (r.liquidation_reference?.trim()) sets.push(sql`liquidation_reference = ${r.liquidation_reference.trim()}`);
      const liq = cleanDate(r.liquidation_date);
      if (liq) sets.push(sql`liquidation_date = ${liq}`);
      if (r.quittance_reference?.trim()) sets.push(sql`quittance_reference = ${r.quittance_reference.trim()}`);
      const quit = cleanDate(r.quittance_date);
      if (quit) sets.push(sql`quittance_date = ${quit}`);
      const amt = (r.liquidation_amount ?? '').trim();
      if (amt && Number.isFinite(Number(amt))) sets.push(sql`liquidation_amount = ${Number(amt)}`);

      if (sets.length === 0) {
        failed++;
        errors.push(`${mca} — nothing to write: columns B to H are all empty or unreadable.`);
        continue;
      }
      sets.push(sql`updated_by = ${uid}`);
      sets.push(sql`updated_at = now()`);

      const res = await tx.execute(sql`
        UPDATE ${table} SET ${sql.join(sets, sql`, `)}
        WHERE display = 'Y' AND upper(trim(mca_ref)) = ${normalizeRef(mca)}`);
      const rowCount = (res as unknown as { rowCount: number | null }).rowCount ?? 0;
      if (rowCount > 0) {
        updated++;
        updatedRefs.push(mca);
      } else {
        failed++;
        // Reaching here means the record was deleted between the preview and the
        // commit — validation had already confirmed it existed and was visible.
        errors.push(`${mca} — no longer available to update; it may have been deleted since the file was checked.`);
      }
    }

    // §4.28 — one entry for the batch, because a file IS one operator action and
    // that is the unit someone reading the log needs to find. Every reference it
    // touched is recorded, so an individual record still traces back to the
    // upload that changed it.
    if (updated > 0) {
      await recordAudit(tx, {
        actorId: uid,
        actorType: 'user',
        action: 'import',
        entityType: `sydonia:${kind}`,
        entityId: 'bulk',
        after: { updated, failed, references: updatedRefs },
        metadata: { source: 'sydonia-excel-upload', kind, submitted: rows.length },
      });
    }
  });

  return { updated, failed, updatedRefs, errors };
}
