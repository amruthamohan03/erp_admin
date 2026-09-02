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
import { buildReference } from '@/db/queries/mcaRefGenerator';
import { type McaRefTargetKey } from '@/lib/mcaRefFormat';

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
// Every auto-generated reference in the app is built by one generator (§4.33,
// src/db/queries/mcaRefGenerator.ts): it resolves the master codes from whatever
// the form has so far, then arranges them according to the format configured
// under Developer Options. These entries only say WHICH reference each field is
// bound to — the arrangement is config, and the SQL is vetted and lives there.
//
// The source returns the finished reference under `ref`, so a field binds
// `{ref}` as its template and the codes stay available to anything else on the
// page. The same generator serves a bulk create, which asks for N consecutive
// references — so one screen can no longer name a consignment differently from
// another (§4.10).

function referenceSource(key: McaRefTargetKey): DeriveSource {
  return {
    async resolve(values) {
      const built = await buildReference(key, values);
      if (!built) return null;
      return {
        ref: built.ref,
        client: built.tokens.client ?? null,
        kind: built.tokens.kind ?? null,
        goods: built.tokens.goods ?? null,
        transport: built.tokens.transport ?? null,
        office: built.tokens.office ?? null,
        year: built.tokens.year ?? null,
        seq: built.seq,
      };
    },
  };
}

SOURCES.license_mca = referenceSource('license');
SOURCES.import_mca = referenceSource('import');
SOURCES.export_mca = referenceSource('export');
SOURCES.local_lt = referenceSource('local');
SOURCES.export_invoice_ref = referenceSource('export-invoice');
SOURCES.import_invoice_ref = referenceSource('import-invoice');

export function getDeriveSource(name: string): DeriveSource | null {
  return SOURCES[name] ?? null;
}
