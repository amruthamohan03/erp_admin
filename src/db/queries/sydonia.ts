// §3 Sydonia bulk-update — an Excel of MCA refs patches declaration / liquidation
// / quittance milestones onto existing tracking rows (imports_t or exports_t).
// Ports importsydonia / exportsydonia: match by MCA ref (case/space-insensitive),
// update only the non-empty columns, never insert. Both kinds share every column
// name, so one code path handles them via the table identifier (§4.10).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type SydoniaKind = 'import' | 'export';

// Excel columns A–H → these keys. Column C ("Declaration Date") writes
// dgda_in_date, matching the legacy mapping.
export interface SydoniaRow {
  mca_ref: string;
  declaration_reference: string;
  declaration_date: string;
  liquidation_reference: string;
  liquidation_date: string;
  quittance_reference: string;
  quittance_date: string;
  liquidation_amount: string;
}

const TABLE: Record<SydoniaKind, string> = { import: 'imports_t', export: 'exports_t' };

const norm = (s: string): string => s.trim().toUpperCase();

/** YYYY-MM-DD or null. Accepts Excel date strings (dd/mm/yyyy, ISO, …). */
export function cleanDate(v: string): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy → ISO
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  let d: Date;
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    d = new Date(year, Number(mm) - 1, Number(dd));
  } else {
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** The subset of the given MCA refs that exist in the target table. */
export async function existingMcaRefs(kind: SydoniaKind, refs: string[]): Promise<Set<string>> {
  const normalized = [...new Set(refs.map(norm).filter(Boolean))];
  if (normalized.length === 0) return new Set();
  const res = await db.execute(sql`
    SELECT DISTINCT upper(trim(mca_ref)) AS k
    FROM ${sql.identifier(TABLE[kind])}
    WHERE display = 'Y' AND upper(trim(mca_ref)) = ANY(${normalized})`);
  const rows = (res as unknown as { rows: { k: string }[] }).rows;
  return new Set(rows.map((r) => r.k));
}

export interface SydoniaUpdateResult {
  updated: number;
  failed: number;
  errors: string[];
}

// Patch each row: only non-empty fields are written; a row with an MCA ref but no
// updatable data is counted as failed (nothing to do), matching the legacy.
export async function applySydoniaUpdates(
  kind: SydoniaKind,
  rows: SydoniaRow[],
  uid: number,
): Promise<SydoniaUpdateResult> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const table = sql.identifier(TABLE[kind]);

  for (const r of rows) {
    const mca = (r.mca_ref ?? '').trim();
    if (!mca) continue;

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
      errors.push(`MCA ${mca}: no data to update`);
      continue;
    }
    sets.push(sql`updated_by = ${uid}`);
    sets.push(sql`updated_at = now()`);

    const res = await db.execute(sql`
      UPDATE ${table} SET ${sql.join(sets, sql`, `)}
      WHERE display = 'Y' AND upper(trim(mca_ref)) = ${norm(mca)}`);
    const rowCount = (res as unknown as { rowCount: number | null }).rowCount ?? 0;
    if (rowCount > 0) updated++;
    else {
      failed++;
      errors.push(`MCA ${mca}: not found or unchanged`);
    }
  }

  return { updated, failed, errors };
}
