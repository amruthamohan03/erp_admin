// §2 step 3 — Fiche de Calcul: the queries behind the transaction page's save
// hook, its pickers, the list, and the workflow buttons.
//
// Three rules live here and nowhere else:
//
//   * A fiche is raised on ONE live, uncancelled import file, on the licence it
//     names, and a file carries at most one live fiche (main's "already used for
//     creating a fiche"). Checked on save; the partial unique index backs it.
//   * CIF, the coefficient and every line's CIF / DDI are recomputed on save from
//     the tax_rule_master_t formulas (src/lib/fiche/calc.ts). Submitted figures
//     are ignored.
//   * The status is the `fiche_de_calcul` workflow (§4.6). A fiche can be edited
//     or deleted while its state still has a transition out of it — so the
//     final state (Audited, as seeded) locks it, and adding a state or a step is
//     a workflow_transition_master_t row, not a code change.
import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import { ficheDeCalcul } from '@/db/schema';
import { loadTaxRule } from '@/engine/rules';
import { executeTransition, loadWorkflow, type WorkflowWithTransitions } from '@/engine/workflow';
import { recordAudit } from '@/lib/audit/recordAudit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  computeFiche,
  FICHE_RULE_KEYS,
  FicheRuleError,
  normaliseFicheItem,
  type FicheRuleName,
  type FicheRules,
} from '@/lib/fiche/calc';
import { fileNotCancelled } from './fileCancellation';
import { buildReference } from './mcaRefGenerator';
import { raiseEvent } from './notifications';

export const FICHE_WORKFLOW_KEY = 'fiche_de_calcul';

type Rows<T> = { rows: T[] };
const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** No OTHER live fiche is raised on this import file. */
function noOtherFiche(importCol: SQL, selfFicheId: number | null): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM fiche_de_calcul_t fx
    WHERE fx.import_id = ${importCol} AND fx.display = 'Y' AND fx.id <> ${selfFicheId ?? 0})`;
}

// ---------------------------------------------------------------------------
// PICKERS — the licence, then the MCA references on it
// ---------------------------------------------------------------------------

/**
 * Licences carrying at least one import file a fiche can still be raised on.
 * `current` keeps the licence of the fiche being edited, whose only file may be
 * that fiche's own — otherwise reopening it would blank the licence.
 */
export async function ficheLicenses(current: number | null): Promise<{ id: number; license_number: string }[]> {
  const rows = await db.execute(sql`
    SELECT l.id, l.license_number
    FROM license_t l
    WHERE l.id = ${current ?? 0}
       OR EXISTS (
         SELECT 1 FROM imports_t i
         WHERE i.license_id = l.id AND i.display = 'Y' AND i.mca_ref IS NOT NULL AND i.mca_ref <> ''
           AND ${fileNotCancelled(sql`i.clearing_status`)}
           AND ${noOtherFiche(sql`i.id`, null)})
    ORDER BY l.id`);
  return (rows as unknown as Rows<{ id: number; license_number: string }>).rows;
}

export interface FicheFileOption {
  id: number;
  mca_ref: string;
  invoice: string | null;
}

/**
 * The licence's import files a fiche can be raised on. `current` keeps the file
 * the fiche being edited already holds, so reopening it does not blank the pick.
 */
export async function ficheFiles(licenseId: number, current: number | null): Promise<FicheFileOption[]> {
  const rows = await db.execute(sql`
    SELECT i.id, i.mca_ref, i.invoice
    FROM imports_t i
    WHERE i.license_id = ${licenseId} AND i.display = 'Y'
      AND i.mca_ref IS NOT NULL AND i.mca_ref <> ''
      AND (
        i.id = ${current ?? 0}
        OR (${fileNotCancelled(sql`i.clearing_status`)} AND ${noOtherFiche(sql`i.id`, null)})
      )
    ORDER BY i.id`);
  return (rows as unknown as Rows<FicheFileOption>).rows;
}

// ---------------------------------------------------------------------------
// FORMULAS
// ---------------------------------------------------------------------------

/** The fiche formulas in effect on `asOf`, from tax_rule_master_t. */
export async function loadFicheRules(asOf: Date = new Date()): Promise<FicheRules> {
  const names = Object.keys(FICHE_RULE_KEYS) as FicheRuleName[];
  const rows = await Promise.all(names.map((n) => loadTaxRule(FICHE_RULE_KEYS[n], asOf)));
  return Object.fromEntries(names.map((n, i) => [n, rows[i]?.formula])) as FicheRules;
}

async function isUsd(currencyId: number | null, exec: Transaction | typeof db = db): Promise<boolean> {
  if (!currencyId) return true; // main defaults a fiche to USD
  const rows = await exec.execute(sql`
    SELECT upper(trim(currency_short_name)) AS code FROM currency_master_t WHERE id = ${currencyId}`);
  return (rows as unknown as Rows<{ code: string | null }>).rows[0]?.code === 'USD';
}

// ---------------------------------------------------------------------------
// WORKFLOW
// ---------------------------------------------------------------------------

export interface FicheWorkflow {
  initial_state: string;
  transitions: { key: string; from: string; to: string }[];
  /** Every state, in the order the workflow reaches them. */
  states: string[];
}

function describe(wf: WorkflowWithTransitions): FicheWorkflow {
  const states: string[] = [wf.initialState];
  for (const t of wf.transitions) {
    for (const s of [t.fromState, t.toState]) if (!states.includes(s)) states.push(s);
  }
  return {
    initial_state: wf.initialState,
    transitions: wf.transitions.map((t) => ({ key: t.transitionKey, from: t.fromState, to: t.toState })),
    states,
  };
}

export async function ficheWorkflow(): Promise<FicheWorkflow> {
  return describe(await loadWorkflow(FICHE_WORKFLOW_KEY));
}

/** A fiche is open to change while its state still leads somewhere. */
export const isFicheEditable = (wf: FicheWorkflow, state: string | null): boolean =>
  state == null || wf.transitions.some((t) => t.from === state);

// ---------------------------------------------------------------------------
// SAVE HOOK — called by the page save route for slug 'fiche'
// ---------------------------------------------------------------------------

export interface FicheSave {
  columns: Record<string, unknown>;
  problem?: { message: string; field: string };
}

function parseItems(raw: unknown): Record<string, unknown>[] | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
}

export async function computeFicheSave(
  ctx: Record<string, unknown>,
  ficheId: number | null,
  before: Record<string, unknown> | null,
): Promise<FicheSave> {
  const wf = await ficheWorkflow();
  if (before && !isFicheEditable(wf, (before['state'] as string | null) ?? null)) {
    return {
      columns: {},
      problem: { message: `This fiche is ${String(before['state']).toUpperCase()} and can no longer be changed.`, field: 'fiche_reference' },
    };
  }

  const importId = toId(ctx['import_id']);
  const licenseId = toId(ctx['license_id']);
  if (importId && licenseId) {
    const rows = await db.execute(sql`
      SELECT i.license_id,
             NOT ${fileNotCancelled(sql`i.clearing_status`)} AS cancelled,
             (SELECT fx.fiche_reference FROM fiche_de_calcul_t fx
               WHERE fx.import_id = i.id AND fx.display = 'Y' AND fx.id <> ${ficheId ?? 0} LIMIT 1) AS other
      FROM imports_t i WHERE i.id = ${importId} AND i.display = 'Y'`);
    const f = (rows as unknown as Rows<{ license_id: number | null; cancelled: boolean; other: string | null }>).rows[0];
    const keptOwn = before != null && toId(before['import_id']) === importId;
    if (!f) return { columns: {}, problem: { message: 'MCA Reference: the chosen file no longer exists — choose another.', field: 'import_id' } };
    if (f.license_id !== licenseId) {
      return { columns: {}, problem: { message: 'MCA Reference: this file is not on the chosen licence — choose the licence first, then one of its files.', field: 'import_id' } };
    }
    if (f.cancelled && !keptOwn) {
      return { columns: {}, problem: { message: 'MCA Reference: this file is CANCELLED, so no fiche can be raised on it.', field: 'import_id' } };
    }
    if (f.other) {
      return { columns: {}, problem: { message: `MCA Reference: this file already has fiche ${f.other}. A file carries one fiche.`, field: 'import_id' } };
    }
  }

  const rawItems = parseItems(ctx['items']) ?? [];
  if (rawItems.length === 0) {
    return { columns: {}, problem: { message: 'Items: add at least one line — a fiche calculates duty per line.', field: 'items' } };
  }

  let computed;
  try {
    computed = computeFiche(
      {
        fob: N(ctx['fob']),
        fret: N(ctx['fret']),
        insurance: N(ctx['insurance_amount']),
        autres_charges: N(ctx['autres_charges']),
        usd_rate: N(ctx['usd_to_currency_rate']) || 1,
        tx_de_change: N(ctx['tx_de_change']),
        is_usd: await isUsd(toId(ctx['currency_id'])),
      },
      rawItems.map((r, i) => normaliseFicheItem(r, i)),
      await loadFicheRules(),
    );
  } catch (e) {
    if (e instanceof FicheRuleError || e instanceof NotFoundError) {
      return { columns: {}, problem: { message: e.message, field: 'items' } };
    }
    throw e;
  }

  // §4.33 — the reference is issued by the one generator from the file, never
  // taken from the submission (the field is read-only, not trusted).
  const reference = importId ? await buildReference('fiche', ctx) : null;
  if (!reference) {
    return { columns: {}, problem: { message: 'Fiche Reference: choose the MCA reference first — the fiche is named after its file.', field: 'import_id' } };
  }

  const columns: Record<string, unknown> = {
    fiche_reference: reference.ref,
    cif: computed.cif,
    coefficient: computed.coefficient,
    items: computed.items,
  };
  if (!before) columns['state'] = wf.initial_state;
  return { columns };
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export interface FicheListRow {
  id: number;
  fiche_reference: string | null;
  client_name: string | null;
  client_legal_name: string | null;
  license_number: string | null;
  mca_ref: string | null;
  fiche_date: string | null;
  poids: number;
  cif: number;
  total_ddi: number;
  state: string | null;
}

export interface FicheListQuery {
  page: number;
  pageSize: number;
  q?: string;
  state?: string;
}

function listWhere(q?: string, state?: string): SQL {
  const conds: SQL[] = [sql`f.display = 'Y'`];
  if (state) conds.push(sql`f.state = ${state}`);
  const term = q?.trim();
  if (term) {
    const like = `%${term}%`;
    // The Client column shows the code; the legal name is searched too (§4.15),
    // and a DD-MM-YYYY date is typeable as displayed (§4.19).
    conds.push(sql`(
      f.fiche_reference ILIKE ${like} OR i.mca_ref ILIKE ${like} OR l.license_number ILIKE ${like}
      OR c.short_name ILIKE ${like} OR c.company_name ILIKE ${like} OR f.state ILIKE ${like}
      OR to_char(f.fiche_date, 'DD-MM-YYYY') ILIKE ${like} OR to_char(f.fiche_date, 'YYYY-MM-DD') ILIKE ${like})`);
  }
  return sql.join(conds, sql` AND `);
}

const LIST_FROM = sql`
  FROM fiche_de_calcul_t f
  LEFT JOIN imports_t i ON i.id = f.import_id
  LEFT JOIN license_t l ON l.id = f.license_id
  LEFT JOIN client_master_t c ON c.id = i.client_id`;

export async function listFiches(query: FicheListQuery): Promise<{ items: FicheListRow[]; total: number }> {
  const where = listWhere(query.q, query.state);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT f.id, f.fiche_reference, c.short_name AS client_name, c.company_name AS client_legal_name,
             l.license_number, i.mca_ref, to_char(f.fiche_date, 'YYYY-MM-DD') AS fiche_date,
             COALESCE(f.poids, 0)::float8 AS poids, COALESCE(f.cif, 0)::float8 AS cif,
             COALESCE((SELECT SUM((e->>'ddi')::numeric) FROM jsonb_array_elements(COALESCE(f.items, '[]'::jsonb)) e), 0)::float8 AS total_ddi,
             f.state
      ${LIST_FROM}
      WHERE ${where}
      ORDER BY f.id DESC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    db.execute(sql`SELECT count(*)::int AS n ${LIST_FROM} WHERE ${where}`),
  ]);
  return {
    items: (rows as unknown as Rows<FicheListRow>).rows,
    total: (count as unknown as Rows<{ n: number }>).rows[0]?.n ?? 0,
  };
}

/** Every matching fiche, for the Excel export — the same filter as the list. */
export async function exportFiches(q?: string, state?: string): Promise<FicheListRow[]> {
  const rows = await db.execute(sql`
    SELECT f.id, f.fiche_reference, c.short_name AS client_name, c.company_name AS client_legal_name,
           l.license_number, i.mca_ref, to_char(f.fiche_date, 'YYYY-MM-DD') AS fiche_date,
           COALESCE(f.poids, 0)::float8 AS poids, COALESCE(f.cif, 0)::float8 AS cif,
           COALESCE((SELECT SUM((e->>'ddi')::numeric) FROM jsonb_array_elements(COALESCE(f.items, '[]'::jsonb)) e), 0)::float8 AS total_ddi,
           f.state
    ${LIST_FROM}
    WHERE ${listWhere(q, state)}
    ORDER BY f.id DESC
    LIMIT 5000`);
  return (rows as unknown as Rows<FicheListRow>).rows;
}

/** Live fiches per workflow state — the stat cards. */
export async function ficheStateCounts(): Promise<Record<string, number>> {
  const rows = await db.execute(sql`
    SELECT COALESCE(state, '') AS state, count(*)::int AS n
    FROM fiche_de_calcul_t WHERE display = 'Y' GROUP BY 1`);
  return Object.fromEntries(
    (rows as unknown as Rows<{ state: string; n: number }>).rows.map((r) => [r.state, r.n]),
  );
}

// ---------------------------------------------------------------------------
// WRITES — transition and delete
// ---------------------------------------------------------------------------

const FICHE_COLUMNS = new Set(Object.values(getTableColumns(ficheDeCalcul)).map((c) => c.name));

async function lockFiche(tx: Transaction, id: number): Promise<Record<string, unknown>> {
  const rows = await tx.execute(sql`
    SELECT * FROM fiche_de_calcul_t WHERE id = ${id} AND display = 'Y' FOR UPDATE`);
  const row = (rows as unknown as Rows<Record<string, unknown>>).rows[0];
  if (!row) throw new NotFoundError('This fiche no longer exists — reload the list.');
  return row;
}

/**
 * Move a fiche along its workflow. The transition's rule gate and approval
 * actions are the workflow engine's; its `set_field` patch is written with the
 * new state, restricted to the fiche's own columns.
 */
export async function transitionFiche(
  id: number,
  transitionKey: string,
  actor: { userId: number; roleId: number },
): Promise<{ state: string }> {
  return db.transaction(async (tx) => {
    const before = await lockFiche(tx, id);
    const plan = await executeTransition(FICHE_WORKFLOW_KEY, transitionKey, {
      entity: before,
      actorUserId: actor.userId,
      actorRoleId: actor.roleId,
    });
    if (plan.fromState !== before['state']) {
      throw new ConflictError(
        `This fiche is ${String(before['state'] ?? 'unset').toUpperCase()}, so "${transitionKey}" does not apply — reload the list.`,
      );
    }
    const unknown = Object.keys(plan.patch).filter((k) => !FICHE_COLUMNS.has(k));
    if (unknown.length > 0) {
      throw new ValidationError(
        `The ${transitionKey} step writes ${unknown.join(', ')}, which a fiche does not have — correct the workflow's actions.`,
      );
    }
    const sets = [
      sql`state = ${plan.toState}`,
      sql`updated_by = ${actor.userId}`,
      sql`updated_at = now()`,
      ...Object.entries(plan.patch).map(([k, v]) => sql`${sql.identifier(k)} = ${v as string | number | null}`),
    ];
    const updated = await tx.execute(sql`
      UPDATE fiche_de_calcul_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id} RETURNING *`);
    const after = (updated as unknown as Rows<Record<string, unknown>>).rows[0];
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'status_change',
      entityType: 'page:fiche',
      entityId: id,
      before,
      after,
      metadata: { transition: transitionKey, from: plan.fromState, to: plan.toState },
    });
    // One event per step — fiche.verify, fiche.audit — so each can tell its own roles.
    await announceFiche(tx, `fiche.${transitionKey}`, id, actor.userId);
    return { state: plan.toState };
  });
}

/** Soft delete (§4.27) — refused once the fiche has reached a final state. */
export async function deleteFiche(id: number, actorId: number): Promise<{ fiche_reference: string | null }> {
  const wf = await ficheWorkflow();
  return db.transaction(async (tx) => {
    const before = await lockFiche(tx, id);
    const state = (before['state'] as string | null) ?? null;
    if (!isFicheEditable(wf, state)) {
      throw new ConflictError(`This fiche is ${String(state).toUpperCase()} and can no longer be deleted.`);
    }
    await tx.execute(sql`
      UPDATE fiche_de_calcul_t SET display = 'N', updated_by = ${actorId}, updated_at = now() WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId,
      action: 'delete',
      entityType: 'page:fiche',
      entityId: id,
      before,
      after: { ...before, display: 'N' },
    });
    return { fiche_reference: (before['fiche_reference'] as string | null) ?? null };
  });
}

/** Raise a fiche notification event: {ref}, {mca_ref}, {client}, {state}. */
export async function announceFiche(tx: Transaction, eventKey: string, id: number, actorUserId: number): Promise<void> {
  const rows = await tx.execute(sql`
    SELECT f.fiche_reference, f.state, f.created_by, i.mca_ref, c.short_name AS client
    FROM fiche_de_calcul_t f
    LEFT JOIN imports_t i ON i.id = f.import_id
    LEFT JOIN client_master_t c ON c.id = i.client_id
    WHERE f.id = ${id}`);
  const f = (rows as unknown as Rows<{ fiche_reference: string | null; state: string | null; created_by: number | null; mca_ref: string | null; client: string | null }>).rows[0];
  if (!f) return;
  await raiseEvent(tx, eventKey, {
    actorUserId,
    creatorUserId: f.created_by,
    context: {
      ref: f.fiche_reference ?? `#${id}`,
      mca_ref: f.mca_ref,
      client: f.client,
      state: String(f.state ?? '').replace(/_/gu, ' ').toUpperCase(),
    },
  });
}

// ---------------------------------------------------------------------------
// PRINT
// ---------------------------------------------------------------------------

export interface FichePrintData {
  header: Record<string, unknown>;
  items: ReturnType<typeof normaliseFicheItem>[];
}

export async function getFicheForPrint(id: number): Promise<FichePrintData | null> {
  const rows = await db.execute(sql`
    SELECT f.*, to_char(f.fiche_date, 'YYYY-MM-DD') AS fiche_date_iso,
           i.mca_ref, i.supplier, l.license_number,
           c.company_name AS client_legal_name, c.short_name AS client_name,
           r.regime_name, tm.transport_mode_name,
           cu.currency_short_name AS currency, fc.currency_short_name AS fob_currency,
           ic.currency_short_name AS insurance_currency, frc.currency_short_name AS fret_currency,
           oc.currency_short_name AS autres_charges_currency,
           inc.incoterm_short_name, inc.incoterm_full_name,
           tg.goods_type
    FROM fiche_de_calcul_t f
    LEFT JOIN imports_t i ON i.id = f.import_id
    LEFT JOIN license_t l ON l.id = f.license_id
    LEFT JOIN client_master_t c ON c.id = i.client_id
    LEFT JOIN regime_master_t r ON r.id = f.regime_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = f.transport_mode_id
    LEFT JOIN currency_master_t cu ON cu.id = f.currency_id
    LEFT JOIN currency_master_t fc ON fc.id = f.fob_currency_id
    LEFT JOIN currency_master_t ic ON ic.id = f.insurance_currency_id
    LEFT JOIN currency_master_t frc ON frc.id = f.fret_currency_id
    LEFT JOIN currency_master_t oc ON oc.id = f.autres_charges_currency_id
    LEFT JOIN incoterm_master_t inc ON inc.id = f.incoterm_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = l.type_of_goods_id
    WHERE f.id = ${id} AND f.display = 'Y'`);
  const header = (rows as unknown as Rows<Record<string, unknown>>).rows[0];
  if (!header) return null;
  const items = (parseItems(header['items']) ?? []).map((r, i) => normaliseFicheItem(r, i));
  return { header, items };
}
