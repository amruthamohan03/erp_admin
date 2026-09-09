// §8 — the link between a physical seal and the consignment holding it.
//
// `exports_t.dgda_seal_no` is a comma-joined list of seal numbers and
// `number_of_seals` is its count; `seal_number_t.status` is the seal's own
// lifecycle. Those two must agree, and until now they only agreed in one
// direction: saving an export reserves and releases seals (see the export page
// save), but releasing a seal from the Seals master flipped it to Available
// while the export went on naming it. The seal was then handed to a second
// consignment while the first still claimed it.
//
// Everything that reads or rewrites that list lives here so there is one answer
// to "which file holds this seal" and one way to take it back out (§4.10).
import { and, eq, sql } from 'drizzle-orm';
import { exportT } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { ConflictError } from '@/lib/errors';

type Executor = Database | Transaction;

/**
 * The stored form is a comma-joined string, so splitting it is the one thing
 * every caller needs. Three copies of this had grown — the page save, the bulk
 * update and this module — and a whitespace difference between them is the kind
 * of bug that shows up as a seal count off by one.
 */
export function splitSeals(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Back to storage form. Empty means the column is cleared, not `''`. */
export function joinSeals(list: readonly string[]): string | null {
  return list.length > 0 ? list.join(', ') : null;
}

export interface SealHolder {
  export_id: number;
  mca_ref: string | null;
  /** Only the seals from the requested set that this export holds. */
  seal_numbers: string[];
}

/**
 * Which live exports hold any of these seal numbers.
 *
 * Matched as whole list entries, never as a substring: `LIKE '%12%'` would
 * report seal 12 as held by an export carrying seal 123. Postgres splits the
 * column and compares each trimmed entry, so only an exact seal matches.
 */
export async function findSealHolders(
  sealNumbers: readonly string[],
  exec: Executor,
): Promise<SealHolder[]> {
  if (sealNumbers.length === 0) return [];

  const wanted = sql.join(
    sealNumbers.map((n) => sql`${n}`),
    sql`, `,
  );

  const rows = await exec.execute(sql`
    SELECT e.id AS export_id,
           e.mca_ref,
           ARRAY(
             SELECT btrim(s.v)
               FROM unnest(string_to_array(e.dgda_seal_no, ',')) AS s(v)
              WHERE btrim(s.v) IN (${wanted})
           ) AS seal_numbers
      FROM exports_t e
     WHERE e.display = 'Y'
       AND e.dgda_seal_no IS NOT NULL
       AND EXISTS (
             SELECT 1
               FROM unnest(string_to_array(e.dgda_seal_no, ',')) AS s(v)
              WHERE btrim(s.v) IN (${wanted})
           )
     ORDER BY e.mca_ref, e.id
  `);

  return ((rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? []).map((r) => ({
    export_id: Number(r.export_id),
    mca_ref: (r.mca_ref as string | null) ?? null,
    seal_numbers: (r.seal_numbers as string[] | null) ?? [],
  }));
}

/**
 * Take these seals off the exports holding them.
 *
 * `number_of_seals` is recomputed from the remaining list rather than
 * decremented, so a column that had already drifted is corrected rather than
 * carried forward. Runs inside the caller's transaction (§7.3) — detaching and
 * releasing are one operation, and a half-done one is exactly the disagreement
 * this module exists to prevent.
 */
export async function detachSealsFromExports(
  holders: readonly SealHolder[],
  uid: number,
  tx: Transaction,
): Promise<number> {
  for (const holder of holders) {
    const [row] = await tx
      .select({ seals: exportT.dgdaSealNo })
      .from(exportT)
      .where(and(eq(exportT.id, holder.export_id), eq(exportT.display, 'Y')))
      .limit(1);
    if (!row) continue;

    const remaining = splitSeals(row.seals).filter((s) => !holder.seal_numbers.includes(s));
    const before = { dgda_seal_no: row.seals };
    const after = {
      dgda_seal_no: joinSeals(remaining),
      // Null rather than 0 when nothing is left: the field is "how many seals",
      // and an export with no seals recorded has no answer, not zero.
      number_of_seals: remaining.length > 0 ? remaining.length : null,
    };

    await tx
      .update(exportT)
      .set({
        dgdaSealNo: after.dgda_seal_no,
        numberOfSeals: after.number_of_seals,
        updatedBy: uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(exportT.id, holder.export_id));

    // §4.28 — audited against the EXPORT, because that is the record that
    // changed. Someone auditing a consignment must see the seal leave it, not
    // have to infer it from a seals-master entry.
    await recordAudit(tx, {
      actorId: uid,
      action: 'update',
      entityType: 'export',
      entityId: String(holder.export_id),
      before,
      after,
      metadata: {
        source: 'seal-release',
        mca_ref: holder.mca_ref,
        detached: holder.seal_numbers,
      },
    });
  }
  return holders.length;
}

/** "EXP-0001 (seals 12, 13)" — the phrasing both the API and the UI use. */
export function describeHolder(h: SealHolder): string {
  return `${h.mca_ref ?? `export #${h.export_id}`} (${
    h.seal_numbers.length === 1 ? 'seal' : 'seals'
  } ${h.seal_numbers.join(', ')})`;
}

/**
 * The guard every path that frees a seal must run first (§4.37).
 *
 * Returns the export files still holding these seals. When there are any and
 * the caller has not confirmed, it THROWS — naming the files, and carrying them
 * in `details` so a UI can turn the refusal into a question rather than a dead
 * end (§4.23).
 *
 * Shared because there is more than one door: the Seals batch screen releases in
 * bulk, and `PUT /seal-numbers/{id}` sets a single seal's status directly. The
 * second one was unguarded, which is the whole bug arriving by another route —
 * a check that lives in one handler is a check the next handler does not have.
 */
export async function assertSealsReleasable(
  sealNumbers: readonly string[],
  opts: { confirmed?: boolean; verb?: string },
  exec: Executor,
): Promise<SealHolder[]> {
  const holders = await findSealHolders(sealNumbers, exec);
  if (holders.length === 0 || opts.confirmed) return holders;

  const one = holders.length === 1;
  const verb = opts.verb ?? 'Releasing';
  throw new ConflictError(
    `${one ? 'This seal is' : 'These seals are'} still on ${one ? 'an export file' : 'export files'}: ` +
      `${holders.map(describeHolder).join('; ')}. ` +
      `${verb} removes the seal from that file and reduces its No. of Seals. Confirm to continue.`,
    {
      // Structured alongside the sentence so the UI renders the list and repeats
      // the call, rather than parsing the message back apart.
      requires_confirmation: 'detach',
      holders,
    },
  );
}

/** Kept beside the split so a count can never be derived a different way. */
export function countSeals(value: unknown): number {
  return splitSeals(value).length;
}
