// §4.12 derive runtime — SERVER-ONLY registry of the sources that `fromRelated`
// and `template` derives read from. This is the vetted layer (cf. targets.ts):
// config rows reference a source by NAME and a column/token; the actual SQL lives
// here so untrusted config can never reach the database as an identifier.
//
// A resolver takes the current form `values` and returns a flat object:
//   • fromRelated  → { <column>: <value>, ... } (one row off the related entity)
//   • template     → { <token>: <value>, ... } (+ a computed `seq`/`year`)
// or null when the trigger field needed to resolve isn't set yet.
//
// NOTE (restructure port): raw table names are reconciled to restructure's SQL
// names — `license_t` (main `licenses_t`) and `client_master_t` (main `clients_t`);
// `imports_t`/`exports_t` and the `*_master_t` lookups already match main.

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { loadMcaRefSegments } from '@/db/queries/mcaRefFormats';
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

async function queryOne(query: ReturnType<typeof sql>): Promise<Row | null> {
  const result = await db.execute(query);
  const rows = (result as unknown as { rows?: Row[] }).rows;
  return rows?.[0] ?? null;
}

function toId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface DeriveSource {
  resolve(values: Values): Promise<Row | null>;
}

const SOURCES: Record<string, DeriveSource> = {
  // Import → the selected license. Plain columns the form copies + computed
  // remaining weight/FOB/M3 (license total minus what existing imports consumed).
  license: {
    async resolve(values) {
      const id = toId(values['license_id']);
      if (!id) return null;
      return queryOne(sql`
        SELECT l.kind_id, l.type_of_goods_id, l.transport_mode_id, l.currency_id,
               l.supplier, l.ref_cod, l.invoice_number,
               (COALESCE(l.weight,0) - COALESCE(
                 (SELECT SUM(i.weight) FROM imports_t i WHERE i.license_id = l.id AND i.display = 'Y'),0)) AS remaining_weight,
               (COALESCE(l.fob_declared,0) - COALESCE(
                 (SELECT SUM(i.fob) FROM imports_t i WHERE i.license_id = l.id AND i.display = 'Y'),0)) AS remaining_fob,
               (COALESCE(l.m3,0) - COALESCE(
                 (SELECT SUM(i.m3) FROM imports_t i WHERE i.license_id = l.id AND i.display = 'Y'),0)) AS remaining_m3
        FROM license_t l
        WHERE l.id = ${id}
        LIMIT 1
      `);
    },
  },

  // The signed-in user, for prefill derives that have no triggering field —
  // Verified By / Approved By default to whoever is filling the form in, and
  // their dates to today. Paired with INIT_TRIGGER so they resolve once when a
  // new record opens.
  //
  // Deliberately editable at the config level: this is a convenience, not an
  // attribution lock. Who actually saved the record is the audit log's job
  // (§4.28), and that cannot be typed over.
  session: {
    async resolve() {
      const auth = await getSession().catch(() => null);
      if (!auth) return null;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        user_id: auth.uid,
        username: auth.username,
        role_id: auth.role_id,
        // ISO, because that is what a date column and <input type="date"> both
        // expect — display formatting happens in the UI (§4.19).
        today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      };
    },
  },

  // A client's saved defaults. Feeds the import's Liquidation Paid By (mapped
  // 1/2 → label by the field's `valueMap`) and the licence's License Cleared By
  // (§2.2 — auto from clients_t.license_cleared_by, still user-overridable).
  client: {
    async resolve(values) {
      const id = toId(values['client_id']);
      if (!id) return null;
      return queryOne(sql`
        SELECT liquidation_paid_by, license_cleared_by
        FROM client_master_t WHERE id = ${id} LIMIT 1`);
    },
  },
};

// ── Generated reference numbers ────────────────────────────────────────────
//
// Every auto-generated reference in the app — the two MCA references, the
// licence number, the LT reference and the two invoice references — is built the
// same way: resolve the master CODES from whatever the form has so far, then
// arrange them according to the format configured under Developer Options
// (mca_ref_format_master_t, see src/lib/mcaRefFormat.ts).
//
// The split matters. WHERE a reference reads its codes from is a fact about the
// page and stays here, in vetted SQL. HOW those codes are arranged — order,
// separators, which of them appear at all, how wide the number is — is the part
// a business analyst changes, and that is config (§4.1). Before this, both halves
// were hardcoded and the format was additionally restated as a template string in
// each field's derive row, so changing `NMI-IDCOR26-0001` to `IDCOR26-0001-NMI`
// meant a deploy.

/**
 * The table and column each reference is written to.
 *
 * Vetted, and deliberately NOT part of the config row: `target_key` selects an
 * entry here, so a config row can name a reference but never a table (§4.12).
 */
const REF_TABLES: Record<McaRefTargetKey, { table: string; column: string }> = {
  import: { table: 'imports_t', column: 'mca_ref' },
  export: { table: 'exports_t', column: 'mca_ref' },
  license: { table: 'license_t', column: 'license_number' },
  local: { table: 'locals_t', column: 'mca_lt_reference' },
  'export-invoice': { table: 'export_invoices_t', column: 'invoice_ref' },
  'import-invoice': { table: 'import_invoices_t', column: 'invoice_ref' },
};

const upper = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toUpperCase();
  return s || null;
};

/** Four-digit current year; a 2-digit format slices it (§4.19 keeps display separate). */
const currentYear = (): string => String(new Date().getFullYear());

/**
 * The next number for this format and these codes.
 *
 * The old implementation scanned `LIKE 'prefix%' ORDER BY … DESC`, which only
 * works while the sequence is the LAST segment — and the whole point of the
 * setup screen is that it need not be. Matching on a regex built from the
 * resolved value of every other segment finds the series wherever the number
 * sits, and scopes the counter to exactly what the format prints: two
 * consignments share a counter when every other segment of their reference is
 * identical, and not otherwise.
 *
 * Returns null when the format carries no sequence (the licence number does not).
 */
async function nextSequence(
  key: McaRefTargetKey,
  segments: McaRefSegment[],
  tokens: McaRefTokens,
): Promise<number | null> {
  const built = buildSequencePattern(segments, tokens);
  if (!built) return null;

  const { table, column } = REF_TABLES[key];
  const col = sql.identifier(column);
  // `regexp_match(...)[1]` rather than `substring(x from p)`: the function form
  // takes the pattern as a plain bind parameter, where the `FROM` syntax needs a
  // literal. Soft-deleted rows still count — their reference is spent, and
  // reissuing it would collide the moment one is restored (§4.27).
  const row = await queryOne(sql`
    SELECT COALESCE(MAX(((regexp_match(${col}, ${built.pattern}))[1])::bigint), 0) AS max_seq
    FROM ${sql.identifier(table)}
    WHERE ${col} ~ ${built.pattern}
  `);
  return Number(row?.max_seq ?? 0) + 1;
}

/**
 * Build a derive source for one reference from a token resolver.
 *
 * Returns `{ ref, … }` — the finished reference plus the codes it was built
 * from, so a field can bind `{ref}` and the tokens stay available to anything
 * else on the page. Returns null (→ the field is left blank) when a code the
 * format asks for is missing, rather than emitting a reference with a hole in
 * it: a short reference is not a partial one, it is somebody else's.
 */
function referenceSource(
  key: McaRefTargetKey,
  resolveTokens: (values: Values) => Promise<McaRefTokens | null>,
): DeriveSource {
  return {
    async resolve(values) {
      const tokens = await resolveTokens(values);
      if (!tokens) return null;

      const segments = await loadMcaRefSegments(key);
      const seqSeg = sequenceSegment(segments);
      const seq = seqSeg ? await nextSequence(key, segments, tokens) : null;
      const ref = renderMcaRef(segments, tokens, seq);
      if (!ref) return null;

      return {
        ref,
        client: tokens.client ?? null,
        kind: tokens.kind ?? null,
        goods: tokens.goods ?? null,
        transport: tokens.transport ?? null,
        office: tokens.office ?? null,
        year: tokens.year ?? null,
        seq: seq === null || !seqSeg ? null : String(seq).padStart(sequenceWidthOf(seqSeg), '0'),
      };
    },
  };
}

/** The licence form carries client/kind/goods/transport directly. */
SOURCES.license_mca = referenceSource('license', async (values) => {
  const clientId = toId(values['client_id']);
  const kindId = toId(values['kind_id']);
  const goodsId = toId(values['type_of_goods_id']);
  const transportId = toId(values['transport_mode_id']);
  if (!clientId || !kindId || !goodsId || !transportId) return null;

  const row = await queryOne(sql`
    SELECT c.short_name AS client_short,
           k.kind_short_name AS kind_short,
           tg.goods_short_name AS goods_short,
           tm.transport_letter AS transport_letter
    FROM client_master_t c
    LEFT JOIN kind_master_t k ON k.id = ${kindId}
    LEFT JOIN type_of_goods_master_t tg ON tg.id = ${goodsId}
    LEFT JOIN transport_mode_master_t tm ON tm.id = ${transportId}
    WHERE c.id = ${clientId}
    LIMIT 1
  `);
  if (!row) return null;

  return {
    client: upper(row.client_short),
    kind: upper(row.kind_short),
    goods: upper(row.goods_short),
    transport: upper(row.transport_letter),
    year: currentYear(),
  };
});

/**
 * Import and export tracking take the client from the consignment and the other
 * three codes off the selected licence.
 *
 * `reExportKindId` is a legacy quirk carried over verbatim: on exports, kind 2
 * prints RE whatever the master says (ExportController::getNextMCASequence).
 * It belongs in kind_master_t.kind_short_name and should move there, but that is
 * a data correction with existing references depending on it — not a side effect
 * of making the format configurable.
 */
function trackingReference(key: 'import' | 'export'): DeriveSource {
  return referenceSource(key, async (values) => {
    const clientId = toId(values['client_id']);
    const licenseId = toId(values['license_id']);
    if (!clientId || !licenseId) return null;

    const row = await queryOne(sql`
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
      LIMIT 1
    `);
    if (!row) return null;

    const kind = key === 'export' && Number(row.kind_id) === 2 ? 'RE' : upper(row.kind_short);
    return {
      client: upper(row.client_short),
      kind,
      goods: upper(row.goods_short),
      transport: upper(row.transport_letter),
      year: currentYear(),
    };
  });
}

SOURCES.import_mca = trackingReference('import');
SOURCES.export_mca = trackingReference('export');

/**
 * Local tracking: the client's code plus the selected main office.
 *
 * The office token is the office's FULL name — the format's `letters` decides how
 * much of it prints, so shortening KINSHASA from KI to KIN is a config change.
 */
SOURCES.local_lt = referenceSource('local', async (values) => {
  const clientId = toId(values['client_id']);
  const locationId = toId(values['location']);
  if (!clientId || !locationId) return null;

  const row = await queryOne(sql`
    SELECT c.short_name AS client_short, m.main_location_name AS location_name
    FROM client_master_t c
    CROSS JOIN main_office_master_t m
    WHERE c.id = ${clientId} AND m.id = ${locationId}
    LIMIT 1
  `);
  if (!row) return null;

  return {
    client: upper(row.client_short),
    office: upper(row.location_name),
    year: currentYear(),
  };
});

/** Invoices know only the client — kind, goods and transport aren't on the form. */
function invoiceReference(key: 'export-invoice' | 'import-invoice'): DeriveSource {
  return referenceSource(key, async (values) => {
    const clientId = toId(values['client_id']);
    if (!clientId) return null;
    const row = await queryOne(sql`
      SELECT short_name AS client_short FROM client_master_t WHERE id = ${clientId} LIMIT 1`);
    if (!row) return null;
    return { client: upper(row.client_short), year: currentYear() };
  });
}

SOURCES.export_invoice_ref = invoiceReference('export-invoice');
SOURCES.import_invoice_ref = invoiceReference('import-invoice');

export function getDeriveSource(name: string): DeriveSource | null {
  return SOURCES[name] ?? null;
}
