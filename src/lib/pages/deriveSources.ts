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

  // Licence MCA reference tokens, resolved from the form's OWN master ids (the
  // licence form carries client/kind/goods/transport directly, unlike imports
  // which read them off the selected licence). §4.5: the number is
  // {client_short}-{kind_short}-{goods_short}-{transport_letter}, no year/seq.
  // Returns null (→ field left blank) if any of the four short codes is missing.
  license_mca: {
    async resolve(values) {
      const clientId = toId(values['client_id']);
      const kindId = toId(values['kind_id']);
      const goodsId = toId(values['type_of_goods_id']);
      const transportId = toId(values['transport_mode_id']);
      if (!clientId || !kindId || !goodsId || !transportId) return null;

      const tokens = await queryOne(sql`
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
      if (!tokens) return null;

      const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
      if (
        !tokens.client_short ||
        !tokens.kind_short ||
        !tokens.goods_short ||
        !tokens.transport_letter
      ) {
        return null;
      }
      return {
        client_short: up(tokens.client_short),
        kind_short: up(tokens.kind_short),
        goods_short: up(tokens.goods_short),
        transport_letter: up(tokens.transport_letter),
      };
    },
  },

  // Import MCA reference tokens: client short code + the license's kind/goods/
  // transport short codes, the 2-digit year, and the next sequence for that prefix.
  // The template string itself lives in the field's derive config.
  import_mca: {
    async resolve(values) {
      const clientId = toId(values['client_id']);
      const licenseId = toId(values['license_id']);
      if (!clientId || !licenseId) return null;

      const tokens = await queryOne(sql`
        SELECT c.short_name AS client_short,
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
      if (!tokens) return null;

      const year = String(new Date().getFullYear()).slice(-2);
      const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
      const prefix = `${up(tokens.client_short)}-${up(tokens.kind_short)}${up(tokens.goods_short)}${up(tokens.transport_letter)}${year}-`;

      const last = await queryOne(sql`
        SELECT mca_ref FROM imports_t
        WHERE mca_ref LIKE ${prefix + '%'} AND display = 'Y'
        ORDER BY mca_ref DESC LIMIT 1
      `);
      let next = 1;
      if (last?.mca_ref) {
        const m = /-(\d{4})$/.exec(String(last.mca_ref));
        if (m) next = parseInt(m[1], 10) + 1;
      }

      return {
        client_short: up(tokens.client_short),
        kind_short: up(tokens.kind_short),
        goods_short: up(tokens.goods_short),
        transport_letter: up(tokens.transport_letter),
        year,
        seq: String(next).padStart(4, '0'),
      };
    },
  },

  // Export MCA reference — same shape as import_mca but sequences against
  // exports_t and applies the legacy kind_id = 2 → "RE" short-code override
  // (ExportController::getNextMCASequence).
  export_mca: {
    async resolve(values) {
      const clientId = toId(values['client_id']);
      const licenseId = toId(values['license_id']);
      if (!clientId || !licenseId) return null;

      const tokens = await queryOne(sql`
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
      if (!tokens) return null;

      const year = String(new Date().getFullYear()).slice(-2);
      const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
      // kind_id = 2 (Re-Export) forces the "RE" short code regardless of master value.
      const kindShort = Number(tokens.kind_id) === 2 ? 'RE' : up(tokens.kind_short);
      const prefix = `${up(tokens.client_short)}-${kindShort}${up(tokens.goods_short)}${up(tokens.transport_letter)}${year}-`;

      const last = await queryOne(sql`
        SELECT mca_ref FROM exports_t
        WHERE mca_ref LIKE ${prefix + '%'} AND display = 'Y'
        ORDER BY mca_ref DESC LIMIT 1
      `);
      let next = 1;
      if (last?.mca_ref) {
        const m = /-(\d{4})$/.exec(String(last.mca_ref));
        if (m) next = parseInt(m[1], 10) + 1;
      }

      return {
        client_short: up(tokens.client_short),
        kind_short: kindShort,
        goods_short: up(tokens.goods_short),
        transport_letter: up(tokens.transport_letter),
        year,
        seq: String(next).padStart(4, '0'),
      };
    },
  },
};

// Local-tracking LT reference tokens, resolved from the form's client + office.
// §4.5 format: {client_short(3 letters)}-LT{location_prefix(2 letters)}{year2}-
// {seq4}. Sequence is the next number for that prefix in locals_t.
SOURCES.local_lt = {
  async resolve(values) {
    const clientId = toId(values['client_id']);
    const locationId = toId(values['location']);
    if (!clientId || !locationId) return null;

    const info = await queryOne(sql`
      SELECT c.short_name AS client_short, m.main_location_name AS location_name
      FROM client_master_t c
      CROSS JOIN main_office_master_t m
      WHERE c.id = ${clientId} AND m.id = ${locationId}
      LIMIT 1
    `);
    if (!info) return null;

    const lettersUpper = (v: unknown, n: number) => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, n);
    const clientShort = lettersUpper(info.client_short, 3);
    const locationPrefix = lettersUpper(info.location_name, 2);
    if (!clientShort || !locationPrefix) return null;

    const year = String(new Date().getFullYear()).slice(-2);
    const prefix = `${clientShort}-LT${locationPrefix}${year}-`;

    const last = await queryOne(sql`
      SELECT mca_lt_reference FROM locals_t
      WHERE mca_lt_reference LIKE ${prefix + '%'} AND display = 'Y'
      ORDER BY mca_lt_reference DESC LIMIT 1
    `);
    let next = 1;
    if (last?.mca_lt_reference) {
      const m = /-(\d{4})$/.exec(String(last.mca_lt_reference));
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return { client_short: clientShort, location_prefix: locationPrefix, year, seq: String(next).padStart(4, '0') };
  },
};

// Invoice reference tokens. Both suggest an editable ref of the form
// {year(4)}-{client_short}[-EXP]-{seq(4)}, sequenced against the matching
// invoice table for that year+client prefix. The template string lives in the
// field's derive config; these only supply the tokens.
function invoiceRefSource(kind: 'export' | 'import'): DeriveSource {
  const table = kind === 'export' ? 'export_invoices_t' : 'import_invoices_t';
  const mid = kind === 'export' ? 'EXP-' : '';
  return {
    async resolve(values) {
      const clientId = toId(values['client_id']);
      if (!clientId) return null;
      const info = await queryOne(sql`
        SELECT short_name AS client_short FROM client_master_t WHERE id = ${clientId} LIMIT 1`);
      if (!info?.client_short) return null;

      const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
      const clientShort = up(info.client_short);
      const year = String(new Date().getFullYear());
      const prefix = `${year}-${clientShort}-${mid}`;

      const last = await queryOne(sql`
        SELECT invoice_ref FROM ${sql.identifier(table)}
        WHERE invoice_ref LIKE ${prefix + '%'} AND display = 'Y'
        ORDER BY invoice_ref DESC LIMIT 1`);
      let next = 1;
      if (last?.invoice_ref) {
        const m = /-(\d{4})$/.exec(String(last.invoice_ref));
        if (m) next = parseInt(m[1], 10) + 1;
      }
      return { client_short: clientShort, year, seq: String(next).padStart(4, '0') };
    },
  };
}
SOURCES.export_invoice_ref = invoiceRefSource('export');
SOURCES.import_invoice_ref = invoiceRefSource('import');

export function getDeriveSource(name: string): DeriveSource | null {
  return SOURCES[name] ?? null;
}
