// §5 PARTIELLE allocation service. Budget guards live here so both the
// management API and the import-save hook (C-02) enforce the same rules:
//   • an allotment's weight/FOB can't exceed the licence budget net of siblings
//   • an allotment can't shrink below what its imports already consumed
//   • an import can't over-draw its selected allotment (the doc's core fix)
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { partialT, licenseT } from '@/db/schema';

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface PartielleRow {
  id: number;
  partial_name: string;
  license_id: number | null;
  client_id: number | null;
  partial_weight: number;
  partial_fob: number;
  weight_used: number;
  fob_used: number;
  remaining_weight: number;
  remaining_fob: number;
}

// Usage is rolled up once (GROUP BY) rather than per-row correlated subqueries
// (the doc's P-02 fix). Linked by the legacy string key.
export async function listForLicense(licenseId: number): Promise<PartielleRow[]> {
  const rows = await db.execute(sql`
    SELECT p.id, p.partial_name, p.license_id, p.client_id,
           p.partial_weight, p.partial_fob,
           COALESCE(u.w, 0) AS weight_used, COALESCE(u.f, 0) AS fob_used
    FROM partial_t p
    LEFT JOIN (
      SELECT inspection_reports, SUM(weight) AS w, SUM(fob) AS f
      FROM imports_t WHERE display = 'Y' AND inspection_reports IS NOT NULL
      GROUP BY inspection_reports
    ) u ON u.inspection_reports = p.partial_name
    WHERE p.license_id = ${licenseId} AND p.display = 'Y'
    ORDER BY p.id DESC`);
  return (rows as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => {
    const pw = N(r.partial_weight);
    const pf = N(r.partial_fob);
    const wu = N(r.weight_used);
    const fu = N(r.fob_used);
    return {
      id: r.id as number,
      partial_name: r.partial_name as string,
      license_id: (r.license_id as number) ?? null,
      client_id: (r.client_id as number) ?? null,
      partial_weight: pw,
      partial_fob: pf,
      weight_used: wu,
      fob_used: fu,
      remaining_weight: round3(pw - wu),
      remaining_fob: round3(pf - fu),
    };
  });
}

async function licenceBudget(
  licenseId: number,
): Promise<{ weight: number; fob: number; client_id: number | null } | null> {
  const [l] = await db
    .select({ weight: licenseT.weight, fob: licenseT.fobDeclared, client_id: licenseT.clientId })
    .from(licenseT)
    .where(eq(licenseT.id, licenseId));
  if (!l) return null;
  return { weight: N(l.weight), fob: N(l.fob), client_id: l.client_id ?? null };
}

async function siblingAllocated(
  licenseId: number,
  excludeId: number | null,
): Promise<{ weight: number; fob: number }> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(partial_weight), 0) AS w, COALESCE(SUM(partial_fob), 0) AS f
    FROM partial_t
    WHERE license_id = ${licenseId} AND display = 'Y'
      ${excludeId ? sql`AND id <> ${excludeId}` : sql``}`);
  const r = (rows as unknown as { rows: { w: unknown; f: unknown }[] }).rows[0];
  return { weight: N(r?.w), fob: N(r?.f) };
}

async function consumedByName(partialName: string): Promise<{ weight: number; fob: number }> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(weight), 0) AS w, COALESCE(SUM(fob), 0) AS f
    FROM imports_t WHERE inspection_reports = ${partialName} AND display = 'Y'`);
  const r = (rows as unknown as { rows: { w: unknown; f: unknown }[] }).rows[0];
  return { weight: N(r?.w), fob: N(r?.f) };
}

export class PartielleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartielleError';
  }
}

export interface PartielleInput {
  partial_name: string;
  license_id: number;
  partial_weight: number;
  partial_fob: number;
}

export async function createPartielle(input: PartielleInput, uid: number): Promise<{ id: number }> {
  const budget = await licenceBudget(input.license_id);
  if (!budget) throw new PartielleError('Licence not found');

  const siblings = await siblingAllocated(input.license_id, null);
  if (siblings.weight + input.partial_weight > budget.weight + 0.001) {
    throw new PartielleError(
      `Weight ${input.partial_weight} exceeds the licence's remaining allocation of ${round3(budget.weight - siblings.weight)} KG`,
    );
  }
  if (siblings.fob + input.partial_fob > budget.fob + 0.001) {
    throw new PartielleError(
      `FOB ${input.partial_fob} exceeds the licence's remaining allocation of ${round3(budget.fob - siblings.fob)}`,
    );
  }

  const [row] = await db
    .insert(partialT)
    .values({
      partialName: input.partial_name,
      licenseId: input.license_id,
      clientId: budget.client_id,
      partialWeight: String(input.partial_weight),
      partialFob: String(input.partial_fob),
      licenseWeight: String(budget.weight),
      licenseFob: String(budget.fob),
      createdBy: uid,
      updatedBy: uid,
    })
    .returning({ id: partialT.id });
  return { id: row.id };
}

export async function updatePartielle(
  id: number,
  input: { partial_weight: number; partial_fob: number },
  uid: number,
): Promise<void> {
  const [existing] = await db
    .select({ name: partialT.partialName, licenseId: partialT.licenseId })
    .from(partialT)
    .where(and(eq(partialT.id, id), eq(partialT.display, 'Y')));
  if (!existing || existing.licenseId == null) throw new PartielleError('Allotment not found');

  // can't shrink below what imports already consumed
  const consumed = await consumedByName(existing.name);
  if (input.partial_weight < consumed.weight - 0.001) {
    throw new PartielleError(`Weight can't be below the ${consumed.weight} KG already consumed`);
  }
  if (input.partial_fob < consumed.fob - 0.001) {
    throw new PartielleError(`FOB can't be below the ${consumed.fob} already consumed`);
  }
  // can't exceed the licence budget net of the other allotments
  const budget = await licenceBudget(existing.licenseId);
  if (budget) {
    const siblings = await siblingAllocated(existing.licenseId, id);
    if (siblings.weight + input.partial_weight > budget.weight + 0.001) {
      throw new PartielleError(
        `Weight exceeds the licence's remaining allocation of ${round3(budget.weight - siblings.weight)} KG`,
      );
    }
    if (siblings.fob + input.partial_fob > budget.fob + 0.001) {
      throw new PartielleError(
        `FOB exceeds the licence's remaining allocation of ${round3(budget.fob - siblings.fob)}`,
      );
    }
  }

  await db
    .update(partialT)
    .set({
      partialWeight: String(input.partial_weight),
      partialFob: String(input.partial_fob),
      updatedBy: uid,
      updatedAt: new Date(),
    })
    .where(eq(partialT.id, id));
}

// §5 C-02 — reject an import save that would over-draw its selected allotment.
// Returns an error message, or null when there's nothing to enforce. Reads the
// effective (merged) form values; excludeImportId discounts the file's own
// current consumption on an update.
export async function assertImportPartielleCapacity(
  ctx: Record<string, unknown>,
  excludeImportId: number | null,
): Promise<string | null> {
  const partialName = String(ctx['inspection_reports'] ?? '').trim();
  if (!partialName) return null; // no allotment selected

  const [p] = await db
    .select({ weight: partialT.partialWeight, fob: partialT.partialFob })
    .from(partialT)
    .where(and(eq(partialT.partialName, partialName), eq(partialT.display, 'Y')));
  if (!p) return null; // free-text allotment with no budget row — nothing to enforce

  const weight = N(ctx['weight']);
  const fob = N(ctx['fob']);

  const usedRows = await db.execute(sql`
    SELECT COALESCE(SUM(weight), 0) AS w, COALESCE(SUM(fob), 0) AS f
    FROM imports_t
    WHERE inspection_reports = ${partialName} AND display = 'Y'
      ${excludeImportId ? sql`AND id <> ${excludeImportId}` : sql``}`);
  const used = (usedRows as unknown as { rows: { w: unknown; f: unknown }[] }).rows[0];
  const remainingWeight = round3(N(p.weight) - N(used?.w));
  const remainingFob = round3(N(p.fob) - N(used?.f));

  if (weight > remainingWeight + 0.001) {
    return `Weight ${weight} KG exceeds the remaining allocation of ${remainingWeight} KG on PARTIELLE "${partialName}"`;
  }
  if (fob > remainingFob + 0.001) {
    return `FOB ${fob} exceeds the remaining allocation of ${remainingFob} on PARTIELLE "${partialName}"`;
  }
  return null;
}
