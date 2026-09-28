import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hsGreenPrefixMaster } from '@/db/schema';
import { greenCertificateFor, type GreenCertificateVerdict } from '@/lib/hscodes/greenCertificate';

// One place that reads the green-certificate prefix rules (§4.10).
//
// Every caller wants the same thing — the live prefixes, then the effective
// answer for one or more codes — and the combining logic is pure and lives in
// src/lib/hscodes/greenCertificate.ts so the browser can run it too.

/** The active prefixes, oldest first — soft-deleted rows do not apply (§4.27). */
export async function loadGreenPrefixes(): Promise<string[]> {
  const rows = await db
    .select({ prefix: hsGreenPrefixMaster.prefix })
    .from(hsGreenPrefixMaster)
    .where(eq(hsGreenPrefixMaster.display, 'Y'))
    .orderBy(asc(hsGreenPrefixMaster.id));

  return rows.map((r) => r.prefix);
}

/**
 * Decide a page of HS codes in ONE prefix read.
 *
 * Per row it would be a query per row; the prefix list is a handful of rows and
 * the matching is a string comparison, so it is loaded once and applied in
 * memory.
 */
export async function decideGreenCertificates<
  T extends { hscode_number: string; requires_green_certificate: boolean | null },
>(rows: T[]): Promise<(T & { green_certificate: GreenCertificateVerdict })[]> {
  if (rows.length === 0) return [];
  const prefixes = await loadGreenPrefixes();

  return rows.map((r) => ({
    ...r,
    green_certificate: greenCertificateFor(
      r.hscode_number,
      r.requires_green_certificate,
      prefixes,
    ),
  }));
}
