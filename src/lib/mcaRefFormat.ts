// §4.1/§4.5 — the shape of every auto-generated reference number in the app,
// as configuration rather than code.
//
// A reference is an ordered list of SEGMENTS. Each segment contributes one piece
// of text, and carries the separator that goes in FRONT of it — so the same six
// pieces can be arranged as `NMI-IDCOR26-0001` or `IDCOR26-0001-NMI` purely by
// reordering rows and changing separators, with no deploy.
//
// This module is pure and shared by both sides: the setup screen renders a live
// preview with it, and the server generates the real reference with it, so what
// an operator sees while editing is what gets written (§4.10).
//
// What is NOT here, deliberately: table and column names, and the SQL that reads
// the master codes. Those live in the vetted server-only registry in
// src/lib/pages/deriveSources.ts, so a config row can never reach the database
// as an identifier.

/** Every reference the app generates. Adding one is a code change, not a config row. */
export const MCA_REF_TARGET_KEYS = [
  'import',
  'export',
  'license',
  'local',
  'export-invoice',
  'import-invoice',
] as const;

export type McaRefTargetKey = (typeof MCA_REF_TARGET_KEYS)[number];

export const MCA_REF_SEGMENT_TYPES = [
  'client',
  'kind',
  'goods',
  'transport',
  'office',
  'year',
  'literal',
  'sequence',
] as const;

export type McaRefSegmentType = (typeof MCA_REF_SEGMENT_TYPES)[number];

export interface McaRefSegment {
  type: McaRefSegmentType;
  /**
   * Text placed BEFORE this segment; `''` glues it to the one in front of it.
   * Ignored on the first segment. Undefined means the default `-`.
   *
   * Carrying the separator on the segment rather than on the format as a whole is
   * what makes `IDCOR26` (four segments, no separators) and `NMI-…-0001` (two
   * separated ones) expressible in the same list.
   */
  separator?: string;
  /** `literal` only — the fixed text, e.g. `LT` or `EXP`. */
  value?: string;
  /** `sequence` only — digits, zero-padded. */
  width?: number;
  /** `year` only — 2 for `26`, 4 for `2026`. */
  digits?: number;
  /** Text segments — keep only the first N letters (the office name is a full name). */
  letters?: number;
}

/** The resolved master codes a reference is built from. Missing = not resolvable yet. */
export interface McaRefTokens {
  client?: string | null;
  kind?: string | null;
  goods?: string | null;
  transport?: string | null;
  office?: string | null;
  /** Always the full four-digit year; the segment slices it to `digits`. */
  year?: string | null;
}

export interface McaRefTargetMeta {
  key: McaRefTargetKey;
  /** The page the reference belongs to. */
  label: string;
  /** The field it fills. */
  fieldLabel: string;
  /** Where the codes come from, shown on the setup screen. */
  hint: string;
  /** Segment types this reference can actually resolve — the rest are refused. */
  tokens: McaRefSegmentType[];
  /** Stand-in values, so the setup screen can preview a format before it is used. */
  sample: McaRefTokens;
}

const SAMPLE: McaRefTokens = {
  client: 'NMI',
  kind: 'ID',
  goods: 'CO',
  transport: 'R',
  office: 'KINSHASA',
  year: '2026',
};

// `literal` and `sequence` need no lookup, so every target supports them.
const ALWAYS: McaRefSegmentType[] = ['year', 'literal', 'sequence'];

export const MCA_REF_TARGETS: Record<McaRefTargetKey, McaRefTargetMeta> = {
  import: {
    key: 'import',
    label: 'Import Tracking',
    fieldLabel: 'MCA Reference',
    hint: "Client code from the consignment; kind, goods and transport codes from the selected licence.",
    tokens: ['client', 'kind', 'goods', 'transport', ...ALWAYS],
    sample: SAMPLE,
  },
  export: {
    key: 'export',
    label: 'Export Tracking',
    fieldLabel: 'MCA Reference',
    hint: "Client code from the consignment; kind, goods and transport codes from the selected licence. Re-Export forces the kind code RE.",
    tokens: ['client', 'kind', 'goods', 'transport', ...ALWAYS],
    sample: SAMPLE,
  },
  license: {
    key: 'license',
    label: 'License',
    fieldLabel: 'License Number',
    hint: 'All four codes come from the licence form itself.',
    tokens: ['client', 'kind', 'goods', 'transport', ...ALWAYS],
    sample: SAMPLE,
  },
  local: {
    key: 'local',
    label: 'Local Tracking',
    fieldLabel: 'LT Reference',
    hint: 'Client code from the record; office code from the selected main office.',
    tokens: ['client', 'office', ...ALWAYS],
    sample: SAMPLE,
  },
  'export-invoice': {
    key: 'export-invoice',
    label: 'Export Invoice',
    fieldLabel: 'Invoice Reference',
    hint: 'Client code from the invoice. Kind, goods and transport are not available here.',
    tokens: ['client', ...ALWAYS],
    sample: SAMPLE,
  },
  'import-invoice': {
    key: 'import-invoice',
    label: 'Import Invoice',
    fieldLabel: 'Invoice Reference',
    hint: 'Client code from the invoice. Kind, goods and transport are not available here.',
    tokens: ['client', ...ALWAYS],
    sample: SAMPLE,
  },
};

/**
 * What each reference looked like before it was configurable.
 *
 * These are the runtime fallback as well as the seed, so a missing, blank or
 * deactivated row still produces the reference the operation already knows —
 * a half-configured table must not stop consignments being created.
 */
export const MCA_REF_DEFAULTS: Record<McaRefTargetKey, McaRefSegment[]> = {
  // NMI-IDCOR26-0001
  import: [
    { type: 'client' },
    { type: 'kind', separator: '-' },
    { type: 'goods', separator: '' },
    { type: 'transport', separator: '' },
    { type: 'year', separator: '', digits: 2 },
    { type: 'sequence', separator: '-', width: 4 },
  ],
  export: [
    { type: 'client' },
    { type: 'kind', separator: '-' },
    { type: 'goods', separator: '' },
    { type: 'transport', separator: '' },
    { type: 'year', separator: '', digits: 2 },
    { type: 'sequence', separator: '-', width: 4 },
  ],
  // NMI-ID-CO-R — the licence number carries no year or sequence.
  license: [
    { type: 'client' },
    { type: 'kind', separator: '-' },
    { type: 'goods', separator: '-' },
    { type: 'transport', separator: '-' },
  ],
  // NMI-LTKI26-0001
  local: [
    { type: 'client' },
    { type: 'literal', separator: '-', value: 'LT' },
    { type: 'office', separator: '', letters: 2 },
    { type: 'year', separator: '', digits: 2 },
    { type: 'sequence', separator: '-', width: 4 },
  ],
  // 2026-NMI-EXP-0001
  'export-invoice': [
    { type: 'year', digits: 4 },
    { type: 'client', separator: '-' },
    { type: 'literal', separator: '-', value: 'EXP' },
    { type: 'sequence', separator: '-', width: 4 },
  ],
  // 2026-NMI-0001
  'import-invoice': [
    { type: 'year', digits: 4 },
    { type: 'client', separator: '-' },
    { type: 'sequence', separator: '-', width: 4 },
  ],
};

export const DEFAULT_SEPARATOR = '-';
export const DEFAULT_SEQUENCE_WIDTH = 4;
export const DEFAULT_YEAR_DIGITS = 4;

export function isTargetKey(v: unknown): v is McaRefTargetKey {
  return typeof v === 'string' && (MCA_REF_TARGET_KEYS as readonly string[]).includes(v);
}

/** The separator in front of a segment — `-` unless the format says otherwise. */
export function separatorOf(seg: McaRefSegment): string {
  return seg.separator ?? DEFAULT_SEPARATOR;
}

export function sequenceWidthOf(seg: McaRefSegment): number {
  const w = Number(seg.width);
  return Number.isInteger(w) && w >= 1 && w <= 10 ? w : DEFAULT_SEQUENCE_WIDTH;
}

/** The one sequence segment, if the format has one. A reference may have none. */
export function sequenceSegment(segments: McaRefSegment[]): McaRefSegment | null {
  return segments.find((s) => s.type === 'sequence') ?? null;
}

/** Codes are stored mixed-case in places; a reference is always upper-case. */
function code(raw: unknown, letters?: number): string | null {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return null;
  if (!letters || letters <= 0) return text;
  // Strip the punctuation and spaces of a full name before slicing, so
  // "Kinshasa (Main)" yields KI rather than "KI" plus whatever followed.
  const stripped = text.replace(/[^A-Z0-9]/gu, '');
  return stripped.slice(0, letters) || null;
}

/**
 * The text one segment contributes, or `null` when its token is missing.
 *
 * `null` propagates: a reference with a hole in it is not a shorter reference,
 * it is a DIFFERENT reference that will collide with somebody else's. Better to
 * leave the field blank and let the required check name it (§4.23) than to write
 * `NMI-IDCO26-0001` because a licence had no transport mode.
 */
export function renderSegment(
  seg: McaRefSegment,
  tokens: McaRefTokens,
  seq?: number | null,
): string | null {
  switch (seg.type) {
    case 'literal': {
      const v = String(seg.value ?? '').trim();
      return v || null;
    }
    case 'year': {
      const y = String(tokens.year ?? '').trim();
      if (!/^\d{4}$/u.test(y)) return null;
      return seg.digits === 2 ? y.slice(-2) : y;
    }
    case 'sequence': {
      if (seq === null || seq === undefined) return null;
      return String(seq).padStart(sequenceWidthOf(seg), '0');
    }
    case 'office':
      return code(tokens.office, seg.letters);
    default:
      return code(tokens[seg.type], seg.letters);
  }
}

/**
 * Assemble a reference. Returns `null` if any segment could not be resolved.
 *
 * `seq` is supplied by the caller because working out the next number needs the
 * database; everything else here is pure so the setup screen can preview it.
 */
export function renderMcaRef(
  segments: McaRefSegment[],
  tokens: McaRefTokens,
  seq?: number | null,
): string | null {
  if (segments.length === 0) return null;
  let out = '';
  for (let i = 0; i < segments.length; i += 1) {
    const text = renderSegment(segments[i], tokens, seq);
    if (text === null) return null;
    out += i === 0 ? text : separatorOf(segments[i]) + text;
  }
  return out;
}

/** POSIX ERE escaping — the pattern below is handed to Postgres, not to JS. */
function escapeRe(s: string): string {
  return s.replace(/[.^$*+?()[\]{}|\\]/gu, (c) => `\\${c}`);
}

/**
 * A Postgres regex matching every reference this format has already produced for
 * these tokens, capturing the sequence digits.
 *
 * This is what replaced `LIKE 'prefix%' ORDER BY … DESC`: that only worked while
 * the sequence was the LAST segment, and the whole point of the setup screen is
 * that it need not be. Anchoring on the resolved value of every other segment
 * also means the counter is scoped by exactly what the format prints — drop the
 * year segment and numbering stops resetting annually, with nothing else to keep
 * in step.
 *
 * Returns `null` when the format has no sequence, or a token is missing.
 */
export function buildSequencePattern(
  segments: McaRefSegment[],
  tokens: McaRefTokens,
): { pattern: string; width: number } | null {
  const seqSeg = sequenceSegment(segments);
  if (!seqSeg) return null;

  const width = sequenceWidthOf(seqSeg);
  let pattern = '^';
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (i > 0) pattern += escapeRe(separatorOf(seg));
    if (seg.type === 'sequence') {
      // Exactly one capture group, so `substring(col from pattern)` yields the number.
      pattern += `([0-9]{${width}})`;
      continue;
    }
    const text = renderSegment(seg, tokens);
    if (text === null) return null;
    pattern += escapeRe(text);
  }
  return { pattern: `${pattern}$`, width };
}

export interface McaRefFormatIssue {
  index: number | null;
  message: string;
}

/**
 * Reject a format an operator could not otherwise diagnose. Messages name the
 * segment and what would fix it (§4.23) — "Segment 3 is a literal with no text"
 * rather than "Invalid input".
 */
export function validateSegments(
  segments: McaRefSegment[],
  target: McaRefTargetKey,
): McaRefFormatIssue[] {
  const issues: McaRefFormatIssue[] = [];
  const meta = MCA_REF_TARGETS[target];

  if (segments.length === 0) {
    issues.push({ index: null, message: 'A format needs at least one segment.' });
  }

  let seen = 0;
  segments.forEach((seg, i) => {
    const at = `Segment ${i + 1}`;
    if (!meta.tokens.includes(seg.type)) {
      issues.push({
        index: i,
        message: `${at} uses ${seg.type}, which ${meta.label} cannot resolve. Available here: ${meta.tokens.join(', ')}.`,
      });
    }
    if (seg.type === 'literal' && !String(seg.value ?? '').trim()) {
      issues.push({ index: i, message: `${at} is fixed text with nothing typed in it.` });
    }
    if (seg.type === 'year' && seg.digits !== 2 && seg.digits !== 4) {
      issues.push({ index: i, message: `${at} is a year — choose 2 digits (26) or 4 (2026).` });
    }
    if (seg.type === 'sequence') {
      seen += 1;
      const w = Number(seg.width);
      if (!Number.isInteger(w) || w < 1 || w > 10) {
        issues.push({ index: i, message: `${at} is the number — its width must be between 1 and 10 digits.` });
      }
    }
    if (seg.letters !== undefined) {
      const n = Number(seg.letters);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        issues.push({ index: i, message: `${at} keeps the first ${String(seg.letters)} letters — that must be between 1 and 20.` });
      }
    }
  });

  if (seen > 1) {
    issues.push({
      index: null,
      message: `A format can hold one incrementing number, not ${seen}. Two counters in one reference cannot both be the number that makes it unique.`,
    });
  }

  return issues;
}

/** The sample a format renders to, for the setup screen. Never throws. */
export function previewMcaRef(segments: McaRefSegment[], target: McaRefTargetKey): string {
  const meta = MCA_REF_TARGETS[target];
  return renderMcaRef(segments, meta.sample, 1) ?? '—';
}
