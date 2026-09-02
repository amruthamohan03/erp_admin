// §4.33 — the server side of reference generation: resolve the master codes a
// reference is built from, then arrange them according to the format configured
// under Developer Options → Reference Formats.
//
// Two callers, one implementation (§4.10): the page runtime asks for ONE
// reference as a field derive (src/lib/pages/deriveSources.ts), and a bulk
// create asks for N consecutive ones. Before this, bulk create had its own idea
// of what a reference looked like — an operator typed a prefix and the route
// appended `-0001` — so the same consignment type was named two different ways
// depending on which screen made it.
//
// What lives here and nowhere else: the table and column each reference is
// written to, and the SQL that reads its codes. `target_key` selects an entry in
// the registry below, so a config row can name a reference but never a table.
import { sql } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { loadMcaRefSegments } from './mcaRefFormats';
import {
  buildSequencePattern,
  renderMcaRef,
  sequenceSegment,
  sequenceWidthOf,
  type McaRefSegment,
  type McaRefTargetKey,
  type McaRefTokens,
} from '@/lib/mcaRefFormat';

type Values = Record<string, unknown>;
type Row = Record<string, unknown>;
type Executor = Database | Transaction;

/** The table and column each reference is written to. Vetted — never config. */
const REF_TABLES: Record<McaRefTargetKey, { table: string; column: string }> = {
  import: { table: 'imports_t', column: 'mca_ref' },
  export: { table: 'exports_t', column: 'mca_ref' },
  license: { table: 'license_t', column: 'license_number' },
  local: { table: 'locals_t', column: 'mca_lt_reference' },
  'export-invoice': { table: 'export_invoices_t', column: 'invoice_ref' },
  'import-invoice': { table: 'import_invoices_t', column: 'invoice_ref' },
};

async function queryOne(exec: Executor, query: ReturnType<typeof sql>): Promise<Row | null> {
  const result = await exec.execute(query);
  return (result as unknown as { rows?: Row[] }).rows?.[0] ?? null;
}

function toId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const upper = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toUpperCase();
  return s || null;
};

/** Four-digit current year; a 2-digit format slices it (§4.19 keeps display separate). */
const currentYear = (): string => String(new Date().getFullYear());

/**
 * Where each reference reads its codes from.
 *
 * This is the part that is genuinely per-page and stays in code: the licence
 * form carries client/kind/goods/transport directly, tracking reads three of
 * them off the selected licence, and an invoice knows only the client.
 */
const TOKEN_RESOLVERS: Record<
  McaRefTargetKey,
  (values: Values, exec: Executor) => Promise<McaRefTokens | null>
> = {
  license: async (values, exec) => {
    const clientId = toId(values['client_id']);
    const kindId = toId(values['kind_id']);
    const goodsId = toId(values['type_of_goods_id']);
    const transportId = toId(values['transport_mode_id']);
    if (!clientId || !kindId || !goodsId || !transportId) return null;

    const row = await queryOne(exec, sql`
      SELECT c.short_name AS client_short,
             k.kind_short_name AS kind_short,
             tg.goods_short_name AS goods_short,
             tm.transport_letter AS transport_letter
      FROM client_master_t c
      LEFT JOIN kind_master_t k ON k.id = ${kindId}
      LEFT JOIN type_of_goods_master_t tg ON tg.id = ${goodsId}
      LEFT JOIN transport_mode_master_t tm ON tm.id = ${transportId}
      WHERE c.id = ${clientId}
      LIMIT 1`);
    if (!row) return null;

    return {
      client: upper(row.client_short),
      kind: upper(row.kind_short),
      goods: upper(row.goods_short),
      transport: upper(row.transport_letter),
      year: currentYear(),
    };
  },

  import: (values, exec) => trackingTokens('import', values, exec),
  export: (values, exec) => trackingTokens('export', values, exec),

  local: async (values, exec) => {
    const clientId = toId(values['client_id']);
    const locationId = toId(values['location']);
    if (!clientId || !locationId) return null;

    const row = await queryOne(exec, sql`
      SELECT c.short_name AS client_short, m.main_location_name AS location_name
      FROM client_master_t c
      CROSS JOIN main_office_master_t m
      WHERE c.id = ${clientId} AND m.id = ${locationId}
      LIMIT 1`);
    if (!row) return null;

    // The office token is the FULL name — the format's `letters` decides how much
    // of it prints, so shortening KINSHASA from KI to KIN is a config change.
    return { client: upper(row.client_short), office: upper(row.location_name), year: currentYear() };
  },

  'export-invoice': (values, exec) => clientOnlyTokens(values, exec),
  'import-invoice': (values, exec) => clientOnlyTokens(values, exec),
};

/**
 * Import and export tracking: the client comes from the consignment, the other
 * three codes off the selected licence.
 *
 * The kind 2 → "RE" override on exports is a legacy quirk carried over verbatim
 * (ExportController::getNextMCASequence). It belongs in
 * kind_master_t.kind_short_name and should move there, but that is a data
 * correction with existing references depending on it.
 */
async function trackingTokens(
  kind: 'import' | 'export',
  values: Values,
  exec: Executor,
): Promise<McaRefTokens | null> {
  const clientId = toId(values['client_id']);
  const licenseId = toId(values['license_id']);
  if (!clientId || !licenseId) return null;

  const row = await queryOne(exec, sql`
    SELECT c.short_name AS client_short,
           l.kind_id AS kind_id,
           k.kind_short_name AS kind_short,
           tg.goods_short_name AS goods_short,
           tm.transport_letter AS transport_letter
    FROM license_t l
    LEFT JOIN client_master_t c ON c.id = ${clientId}
    LEFT JOIN kind_master_t k ON k.id = l.kind_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = l.type_of_goods_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = l.transport_mode_id
    WHERE l.id = ${licenseId}
    LIMIT 1`);
  if (!row) return null;

  return {
    client: upper(row.client_short),
    kind: kind === 'export' && Number(row.kind_id) === 2 ? 'RE' : upper(row.kind_short),
    goods: upper(row.goods_short),
    transport: upper(row.transport_letter),
    year: currentYear(),
  };
}

async function clientOnlyTokens(values: Values, exec: Executor): Promise<McaRefTokens | null> {
  const clientId = toId(values['client_id']);
  if (!clientId) return null;
  const row = await queryOne(exec, sql`
    SELECT short_name AS client_short FROM client_master_t WHERE id = ${clientId} LIMIT 1`);
  if (!row) return null;
  return { client: upper(row.client_short), year: currentYear() };
}

/**
 * The highest number already issued for this format and these codes.
 *
 * Matched by a regex built from the resolved value of every other segment, so
 * the number can sit anywhere in the reference — a prefix scan only worked while
 * it was last. This also scopes the counter to exactly what the format prints.
 *
 * Soft-deleted rows count: their reference is spent, and the partial unique
 * index does not filter on `display`, so reissuing one would collide the moment
 * it is restored (§4.27).
 */
async function highestSequence(
  key: McaRefTargetKey,
  segments: McaRefSegment[],
  tokens: McaRefTokens,
  exec: Executor,
): Promise<number | null> {
  const built = buildSequencePattern(segments, tokens);
  if (!built) return null;

  const { table, column } = REF_TABLES[key];
  const col = sql.identifier(column);
  const row = await queryOne(exec, sql`
    SELECT COALESCE(MAX(((regexp_match(${col}, ${built.pattern}))[1])::bigint), 0) AS max_seq
    FROM ${sql.identifier(table)}
    WHERE ${col} ~ ${built.pattern}`);
  return Number(row?.max_seq ?? 0);
}

export interface GeneratedReference {
  ref: string;
  tokens: McaRefTokens;
  /** Zero-padded to the format's width, or null when the format carries no number. */
  seq: string | null;
}

/**
 * `count` consecutive references for one target.
 *
 * Returns an empty array when the codes cannot be resolved — a reference with a
 * hole in it is not a shorter reference, it is a different one that will collide
 * with a record that legitimately has that shape.
 *
 * Asking for more than one from a format that carries no sequence is refused
 * rather than silently returning the same reference N times.
 */
export async function generateReferences(
  key: McaRefTargetKey,
  values: Values,
  count: number,
  exec: Executor = db,
): Promise<GeneratedReference[]> {
  if (count < 1) return [];

  const tokens = await TOKEN_RESOLVERS[key](values, exec);
  if (!tokens) return [];

  const segments = await loadMcaRefSegments(key);
  const seqSeg = sequenceSegment(segments);

  if (!seqSeg) {
    if (count > 1) {
      throw new Error(
        `The ${key} reference format has no number segment, so it cannot produce ${count} distinct references. Add a Number segment under Developer Options → Reference Formats.`,
      );
    }
    const ref = renderMcaRef(segments, tokens);
    return ref ? [{ ref, tokens, seq: null }] : [];
  }

  const width = sequenceWidthOf(seqSeg);
  const highest = (await highestSequence(key, segments, tokens, exec)) ?? 0;

  const out: GeneratedReference[] = [];
  for (let i = 1; i <= count; i += 1) {
    const n = highest + i;
    const ref = renderMcaRef(segments, tokens, n);
    if (!ref) return [];
    out.push({ ref, tokens, seq: String(n).padStart(width, '0') });
  }
  return out;
}

/** One reference — what a field derive needs. Null when the codes don't resolve. */
export async function buildReference(
  key: McaRefTargetKey,
  values: Values,
  exec: Executor = db,
): Promise<GeneratedReference | null> {
  const [first] = await generateReferences(key, values, 1, exec);
  return first ?? null;
}
