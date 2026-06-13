// §4.12 derive runtime — SERVER-ONLY registry of the sources that `fromRelated`
// and `template` derives read from. This is the vetted layer (cf. targets.ts):
// config rows reference a source by NAME and a column/token; the actual SQL lives
// here so untrusted config can never reach the database as an identifier.
//
// A resolver takes the current form `values` and returns a flat object:
//   • fromRelated  → { <column>: <value>, ... } (one row off the related entity)
//   • template     → { <token>: <value>, ... } (+ a computed `seq`/`year`)
// or null when the trigger field needed to resolve isn't set yet.

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
        FROM licenses_t l
        WHERE l.id = ${id}
        LIMIT 1
      `);
    },
  },

  // Import → its client (subscriber). Feeds Liquidation Paid By (mapped 1/2 → label
  // by the field's `valueMap` in config).
  client: {
    async resolve(values) {
      const id = toId(values['client_id']);
      if (!id) return null;
      return queryOne(sql`SELECT liquidation_paid_by FROM clients_t WHERE id = ${id} LIMIT 1`);
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
        FROM licenses_t l
        LEFT JOIN clients_t c ON c.id = ${clientId}
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
        FROM licenses_t l
        LEFT JOIN clients_t c ON c.id = ${clientId}
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

export function getDeriveSource(name: string): DeriveSource | null {
  return SOURCES[name] ?? null;
}
