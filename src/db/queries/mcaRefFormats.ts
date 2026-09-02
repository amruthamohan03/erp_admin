import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mcaRefFormatMaster } from '@/db/schema';
import {
  MCA_REF_DEFAULTS,
  MCA_REF_TARGETS,
  MCA_REF_TARGET_KEYS,
  isTargetKey,
  type McaRefSegment,
  type McaRefTargetKey,
} from '@/lib/mcaRefFormat';

// §4.1 read side. Both the setup screen and the reference generator need the
// same row → DTO mapping, so both come through here (§4.10, §7.4).

export interface McaRefFormatDto {
  target_key: McaRefTargetKey;
  format_name: string;
  segments: McaRefSegment[];
  display: 'Y' | 'N';
  /** True when this row is the shipped default rather than something configured. */
  is_default: boolean;
  updated_at: string | null;
}

function fallback(key: McaRefTargetKey): McaRefFormatDto {
  const meta = MCA_REF_TARGETS[key];
  return {
    target_key: key,
    format_name: `${meta.label} — ${meta.fieldLabel}`,
    segments: MCA_REF_DEFAULTS[key],
    display: 'Y',
    is_default: true,
    updated_at: null,
  };
}

/**
 * Every configured format, deduped per request by React `cache`.
 *
 * Never throws, and always returns all six: a missing, empty or deactivated row
 * falls back to the shipped default, so a half-seeded table still generates the
 * references the operation already knows rather than blocking a save.
 */
export const loadMcaRefFormats = cache(async (): Promise<McaRefFormatDto[]> => {
  let rows: Array<{
    target_key: string;
    format_name: string;
    segments: McaRefSegment[] | null;
    display: string;
    updated_at: Date | null;
  }> = [];

  try {
    rows = await db
      .select({
        target_key: mcaRefFormatMaster.targetKey,
        format_name: mcaRefFormatMaster.formatName,
        segments: mcaRefFormatMaster.segments,
        display: mcaRefFormatMaster.display,
        updated_at: mcaRefFormatMaster.updatedAt,
      })
      .from(mcaRefFormatMaster)
      .orderBy(asc(mcaRefFormatMaster.id));
  } catch {
    return MCA_REF_TARGET_KEYS.map(fallback);
  }

  const configured = new Map(rows.filter((r) => isTargetKey(r.target_key)).map((r) => [r.target_key, r]));

  return MCA_REF_TARGET_KEYS.map((key) => {
    const row = configured.get(key);
    const segments = row?.segments;
    // An empty segment list is not "a reference with no parts" — it is an
    // unfinished row, and generating an empty string for it would write blank
    // references onto real consignments.
    if (!row || row.display !== 'Y' || !Array.isArray(segments) || segments.length === 0) {
      const def = fallback(key);
      return row ? { ...def, format_name: row.format_name || def.format_name, display: row.display === 'N' ? 'N' : 'Y' } : def;
    }
    return {
      target_key: key,
      format_name: row.format_name,
      segments,
      display: 'Y',
      is_default: false,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    };
  });
});

/** The segments in force for one reference. Used by the generator (§4.5). */
export async function loadMcaRefSegments(key: McaRefTargetKey): Promise<McaRefSegment[]> {
  const all = await loadMcaRefFormats();
  return all.find((f) => f.target_key === key)?.segments ?? MCA_REF_DEFAULTS[key];
}

/** One row, straight from the table — for the audit `before` snapshot on save. */
export async function readMcaRefFormatRow(key: McaRefTargetKey): Promise<McaRefFormatDto | null> {
  const [row] = await db
    .select({
      target_key: mcaRefFormatMaster.targetKey,
      format_name: mcaRefFormatMaster.formatName,
      segments: mcaRefFormatMaster.segments,
      display: mcaRefFormatMaster.display,
      updated_at: mcaRefFormatMaster.updatedAt,
    })
    .from(mcaRefFormatMaster)
    .where(eq(mcaRefFormatMaster.targetKey, key))
    .limit(1);

  if (!row) return null;
  return {
    target_key: key,
    format_name: row.format_name,
    segments: Array.isArray(row.segments) ? row.segments : [],
    display: row.display === 'N' ? 'N' : 'Y',
    is_default: false,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
  };
}
