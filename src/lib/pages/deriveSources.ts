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

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fileNotCancelled } from '@/db/queries/fileCancellation';
import { usersT } from '@/db/schema';
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

/**
 * What the form is resolving against, beyond the values themselves.
 *
 * `entityId` is the record being edited, or null for a create. A source that
 * computes "what is left" has to discount the record's OWN consumption —
 * otherwise reopening a saved import shows a licence with its own tonnage
 * already subtracted, and the figure shrinks every time the page is opened.
 */
export interface DeriveContext {
  entityId: number | null;
}

export interface DeriveSource {
  resolve(values: Values, ctx: DeriveContext): Promise<Row | null>;
}

const SOURCES: Record<string, DeriveSource> = {
  // Import → the selected license. Plain columns the form copies + computed
  // remaining weight/FOB/M3 (license total minus what existing imports consumed).
  license: {
    async resolve(values, ctx) {
      const id = toId(values['license_id']);
      if (!id) return null;

      // A licence is drawn down by IMPORTS AND EXPORTS alike. Counting only
      // imports here showed the form more headroom than the licence actually
      // had, and disagreed with both /licenses/{id}/usage (what the export
      // screen reads) and the export bulk-create cap check (what the server
      // enforces) — three answers to one question.
      //
      // The record being edited is excluded from its own remaining figure. Left
      // in, reopening a saved import subtracted its own tonnage a second time,
      // so the number fell every time the page was opened and "what is left if I
      // save this" was unanswerable.
      const self = ctx.entityId;
      const usedImports = (col: string) => sql`
        (SELECT SUM(${sql.identifier(col)}) FROM imports_t i
          WHERE i.license_id = l.id AND i.display = 'Y'
            AND ${fileNotCancelled(sql`i.clearing_status`)}
            ${self ? sql`AND i.id <> ${self}` : sql``})`;
      const usedExports = (col: string) => sql`
        (SELECT SUM(${sql.identifier(col)}) FROM exports_t e
          WHERE e.license_id = l.id AND e.display = 'Y'
            AND ${fileNotCancelled(sql`e.clearing_status`)})`;

      return queryOne(sql`
        SELECT l.kind_id, l.type_of_goods_id, l.transport_mode_id, l.currency_id,
               l.supplier, l.ref_cod, l.invoice_number,
               (COALESCE(l.weight,0)
                  - COALESCE(${usedImports('weight')},0)
                  - COALESCE(${usedExports('weight')},0)) AS remaining_weight,
               (COALESCE(l.fob_declared,0)
                  - COALESCE(${usedImports('fob')},0)
                  - COALESCE(${usedExports('fob')},0)) AS remaining_fob,
               -- exports_t carries no m3, so only imports consume it.
               (COALESCE(l.m3,0) - COALESCE(${usedImports('m3')},0)) AS remaining_m3
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

      // The token carries the login handle, not the person's name or where they
      // work — it is a session credential, not a profile. A field that holds a
      // NAME (Payment Request's Requestee is a varchar, not a user FK) wants the
      // name, and one that holds the operator's own posting (Location,
      // Department) wants those ids, so the profile row is read here rather than
      // at each call site that needs a piece of it (§4.10).
      const [row] = await db
        .select({
          full_name: usersT.fullName,
          location_id: usersT.locationId,
          dept_id: usersT.deptId,
        })
        .from(usersT)
        .where(eq(usersT.id, auth.uid))
        .limit(1);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        user_id: auth.uid,
        username: auth.username,
        // Falls back to the handle rather than to nothing: a prefilled box the
        // operator can correct beats an empty required field.
        full_name: row?.full_name || auth.username,
        // Null when the user's own record has none. A prefill has nothing to
        // offer then, and the derive leaves the field empty for the operator to
        // pick — which is right: guessing a location would put a payment request
        // against the wrong office, and the field is required so it cannot be
        // skipped silently (§4.18).
        location_id: row?.location_id ?? null,
        dept_id: row?.dept_id ?? null,
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
        SELECT liquidation_paid_by, license_cleared_by, invoice_template
        FROM client_master_t WHERE id = ${id} LIMIT 1`);
    },
  },

  // §2 step 3 — a Fiche de Calcul copies its figures off the import file it is
  // raised on (main's getMCADetails). Each fiche field binds one column; the
  // editable ones are prefills the operator may correct, as main allowed.
  fiche_file: {
    async resolve(values) {
      const id = toId(values['import_id']);
      if (!id) return null;
      return queryOne(sql`
        SELECT i.regime AS regime_id, i.currency AS currency_id, i.transport_mode AS transport_mode_id,
               i.weight::float8 AS weight, i.fob::float8 AS fob,
               COALESCE(i.fob_currency, i.currency) AS fob_currency_id,
               i.fret::float8 AS fret, COALESCE(i.fret_currency, i.currency) AS fret_currency_id,
               i.insurance_amount::float8 AS insurance_amount,
               COALESCE(i.insurance_amount_currency, i.currency) AS insurance_currency_id,
               COALESCE(i.other_charges, 0)::float8 AS other_charges,
               COALESCE(i.other_charges_currency, i.currency) AS other_charges_currency_id,
               i.invoice
        FROM imports_t i WHERE i.id = ${id} LIMIT 1`);
    },
  },

  // An incoterm's full wording, shown beside the short code (main's INCOTERM Full).
  incoterm: {
    async resolve(values) {
      const id = toId(values['incoterm_id']);
      if (!id) return null;
      return queryOne(sql`
        SELECT incoterm_full_name FROM incoterm_master_t WHERE id = ${id} LIMIT 1`);
    },
  },

  // The BCC CDF/USD rate an invoice is priced at — main's getLiveBccRate: the
  // nearest cached rate ON OR BEFORE the invoice date, so a weekend or a holiday
  // takes the last business day's rate rather than none. With no invoice date
  // on the form (Import has none) the question is asked of today.
  //
  // Reads the cache only. The e-MCF fetch that fills it lives with the bank
  // exchange-rate screen; a derive must not call an outside service on every
  // keystroke of the field that triggers it.
  bcc_rate: {
    async resolve(values) {
      const raw = values['invoice_date'];
      const asOf =
        typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
      return queryOne(sql`
        SELECT rate::float8 AS rate, to_char(rate_date, 'YYYY-MM-DD') AS rate_date
        FROM dgi_currency_rate_t
        WHERE currency_code = 'USD'
          AND rate_date <= COALESCE(${asOf}::date, CURRENT_DATE)
        ORDER BY rate_date DESC
        LIMIT 1`);
    },
  },

  // A quotation's reference is the four pickers' LABELS joined — main's
  // `${client}-${kind}-${transport}-${goods}`, e.g. "NMI-IMPORT DEFINITVE-ROAD-
  // COPPER". The arrangement is the field's `template` (config); this only says
  // what each token reads.
  //
  // It is not one of §4.33's sequenced references: there is no counter, a
  // quotation is named by what it prices, and two with the same four pickers
  // are the SAME quotation — which is why the save refuses a duplicate rather
  // than numbering it.
  //
  // All-or-nothing, as main's `generateQuotationRef` blanks the field until all
  // four are chosen: a reference with a hole in it is a different reference.
  quotation_ref: {
    async resolve(values) {
      const client = toId(values['client_id']);
      const kind = toId(values['kind_id']);
      const transport = toId(values['transport_mode_id']);
      const goods = toId(values['goods_type_id']);
      if (!client || !kind || !transport || !goods) return null;
      const row = await queryOne(sql`
        SELECT
          (SELECT short_name          FROM client_master_t         WHERE id = ${client})    AS client,
          (SELECT kind_name           FROM kind_master_t           WHERE id = ${kind})      AS kind,
          (SELECT transport_mode_name FROM transport_mode_master_t WHERE id = ${transport}) AS transport,
          (SELECT goods_type          FROM type_of_goods_master_t  WHERE id = ${goods})     AS goods`);
      if (!row) return null;
      const tokens = ['client', 'kind', 'transport', 'goods'] as const;
      const trimmed: Record<string, string> = {};
      for (const t of tokens) {
        const v = row[t] === null || row[t] === undefined ? '' : String(row[t]).trim();
        if (!v) return null;
        trimmed[t] = v;
      }
      return trimmed;
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
SOURCES.fiche_ref = referenceSource('fiche');

export function getDeriveSource(name: string): DeriveSource | null {
  return SOURCES[name] ?? null;
}
