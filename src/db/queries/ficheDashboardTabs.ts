import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ficheDeCalcul } from '@/db/schema';
import { humanizeSegment } from '@/lib/pageTitle';
import { ficheWorkflow, type FicheWorkflow } from './fiches';
import type { FicheDashboardTab } from '@/schemas/fiche-dashboard';

// §4.29 — the data behind the Fiche de Calcul dashboard.
//
// Built like the invoice dashboards: one normalised row (`base`) and every
// aggregate written once against it. Three rules:
//
//  1. Every figure is a SQL aggregate over live rows (`display = 'Y'`, §4.27).
//  2. Money is summed in SQL as `numeric` and only cast to float at the edge.
//  3. The states come from the `fiche_de_calcul` workflow (§4.6) — the same
//     `ficheWorkflow()` the fiche list reads — never from a list in this file.
//     A state with a transition out of it is "open" (the fiche is still being
//     worked on); one without is terminal.
//
// Client, date and DDI follow the fiche list (fiches.ts) so a card and the list
// agree: the client is the import file's client, a fiche is counted on its
// fiche date (falling back to the day it was raised), and DDI is the sum of its
// lines' `ddi`, in CDF. CIF is in the fiche's own currency (USD when none is
// set, as the calculation assumes), so it is never summed across currencies
// without saying so.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** A fiche's lines, or none when the column holds anything but an array. */
const ITEMS: SQL = sql`CASE WHEN jsonb_typeof(f.items) = 'array' THEN f.items ELSE '[]'::jsonb END`;

type LineNumber = 'ddi' | 'ddi_percent' | 'cif_article';

/**
 * A numeric field of one line (`e`), as numeric. Lines are JSONB written by the
 * save route, but an imported or hand-edited line can carry '' or text — those
 * count as 0 rather than failing the whole dashboard on a cast.
 */
function lineNum(key: LineNumber): SQL {
  const k = sql.raw(`'${key}'`);
  return sql`(CASE
    WHEN jsonb_typeof(e->${k}) = 'number' THEN (e->>${k})::numeric
    WHEN trim(e->>${k}) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e->>${k})::numeric
    ELSE 0 END)`;
}

/** The normalised fiche row every aggregate reads. */
const BASE: SQL = sql`
  SELECT f.id,
         f.fiche_reference,
         COALESCE(f.fiche_date, f.created_at::date) AS fiche_day,
         f.created_at,
         f.verified_at,
         f.audited_at,
         i.client_id,
         c.short_name AS client_name,
         c.company_name AS client_company,
         l.license_number,
         i.mca_ref,
         r.regime_name AS regime,
         tm.transport_mode_name AS transport_mode,
         COALESCE(NULLIF(upper(trim(cur.currency_short_name)), ''), 'USD') AS currency,
         COALESCE(f.cif, 0)::numeric AS cif,
         f.coefficient::numeric AS coefficient,
         COALESCE(d.ddi, 0)::numeric AS ddi,
         COALESCE(d.lines, 0) AS lines,
         COALESCE(f.state, '') AS state,
         vu.full_name AS verified_by_name,
         au.full_name AS audited_by_name,
         (current_date - f.created_at::date) AS age_days,
         ${ITEMS} AS items
    FROM ${ficheDeCalcul} f
    LEFT JOIN imports_t i ON i.id = f.import_id
    LEFT JOIN license_t l ON l.id = f.license_id
    LEFT JOIN client_master_t c ON c.id = i.client_id
    LEFT JOIN regime_master_t r ON r.id = f.regime_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = f.transport_mode_id
    LEFT JOIN currency_master_t cur ON cur.id = f.currency_id
    LEFT JOIN users_t vu ON vu.id = f.verified_by
    LEFT JOIN users_t au ON au.id = f.audited_by
    LEFT JOIN LATERAL (
      SELECT SUM(${lineNum('ddi')}) AS ddi, count(*)::int AS lines
        FROM jsonb_array_elements(${ITEMS}) e
    ) d ON true
   WHERE f.display = 'Y'`;

const PERIOD_FLAG: SQL = sql`
  CASE
    WHEN b.fiche_day = current_date THEN 'TODAY'
    WHEN date_trunc('week', b.fiche_day) = date_trunc('week', current_date) THEN 'THISWEEK'
    WHEN date_trunc('month', b.fiche_day) = date_trunc('month', current_date) THEN 'THISMONTH'
    WHEN date_trunc('year', b.fiche_day) = date_trunc('year', current_date) THEN 'THISYEAR'
    ELSE 'OLDER'
  END`;

const AGE_BAND: SQL = sql`
  CASE
    WHEN b.age_days <= 7 THEN 'D0_7'
    WHEN b.age_days <= 30 THEN 'D8_30'
    WHEN b.age_days <= 60 THEN 'D31_60'
    ELSE 'D60_PLUS'
  END`;

/** The last twelve calendar months, oldest first, including the current one. */
const MONTHS: SQL = sql`
  SELECT generate_series(
           date_trunc('month', current_date) - interval '11 months',
           date_trunc('month', current_date),
           interval '1 month')::date AS m`;

/** A workflow key as words — `verified` → `Verified`; no state → ''. */
export const stateLabel = (state: string): string => (state ? humanizeSegment(state) : '');

/** States a fiche can still leave — the work in progress. */
export const openStates = (wf: FicheWorkflow): string[] =>
  wf.states.filter((s) => wf.transitions.some((t) => t.from === s));

/**
 * Rows still being worked on: an open state, or no state at all (the list
 * treats a fiche without a state as editable, so it is not finished either).
 */
function waitingWhere(wf: FicheWorkflow): SQL {
  const open = openStates(wf);
  return open.length > 0
    ? sql`(b.state = '' OR b.state IN (${sql.join(open.map((s) => sql`${s}`), sql`, `)}))`
    : sql`b.state = ''`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

export type PeriodFlag = 'TODAY' | 'THISWEEK' | 'THISMONTH' | 'THISYEAR' | 'OLDER';
export type AgeBand = 'D0_7' | 'D8_30' | 'D31_60' | 'D60_PLUS';

export interface FicheRow {
  id: number;
  fiche_reference: string | null;
  fiche_date: string;
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  license_number: string | null;
  mca_ref: string | null;
  regime: string | null;
  transport_mode: string | null;
  currency: string;
  cif: number;
  coefficient: number | null;
  ddi: number;
  lines: number;
  state: string;
  state_label: string;
  verified_at: string | null;
  verified_by_name: string | null;
  audited_at: string | null;
  audited_by_name: string | null;
  age_days: number;
  period_flag: PeriodFlag;
  age_band: AgeBand;
}

/** Every live fiche, newest first. With `waitingIn`, only those still open. */
export async function getFicheRows(waitingIn?: FicheWorkflow): Promise<FicheRow[]> {
  const res = await db.execute(sql`
    WITH b AS (${BASE})
    SELECT b.id, b.fiche_reference, to_char(b.fiche_day, 'YYYY-MM-DD') AS fiche_date,
           b.client_id, b.client_name, b.client_company, b.license_number, b.mca_ref,
           b.regime, b.transport_mode, b.currency,
           b.cif::float AS cif, b.coefficient::float AS coefficient, b.ddi::float AS ddi,
           b.lines::int AS lines, b.state,
           to_char(b.verified_at, 'YYYY-MM-DD') AS verified_at, b.verified_by_name,
           to_char(b.audited_at, 'YYYY-MM-DD') AS audited_at, b.audited_by_name,
           b.age_days::int AS age_days,
           ${PERIOD_FLAG} AS period_flag, ${AGE_BAND} AS age_band
      FROM b
     ${waitingIn ? sql`WHERE ${waitingWhere(waitingIn)}` : sql``}
     ORDER BY b.id DESC`);
  return rowsOf<Omit<FicheRow, 'state_label'>>(res).map((r) => ({ ...r, state_label: stateLabel(r.state) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared aggregates
// ─────────────────────────────────────────────────────────────────────────────

export interface StateCount {
  state: string;
  label: string;
  count: number;
  ddi: number;
  /** No transition leads out of it — the fiche is finished. */
  terminal: boolean;
}

/**
 * Live fiches per state, in the order the workflow reaches them. A state found
 * on a fiche but no longer in the workflow (or no state at all) is still
 * listed, after the configured ones, so the cards always add up to the total.
 */
async function stateCounts(wf: FicheWorkflow): Promise<StateCount[]> {
  const res = await db.execute(sql`
    WITH b AS (${BASE})
    SELECT b.state, count(*)::int AS count, COALESCE(SUM(b.ddi), 0)::float AS ddi
      FROM b GROUP BY b.state`);
  const found = rowsOf<{ state: string; count: number; ddi: number }>(res);
  const open = new Set(openStates(wf));
  const ordered = [...wf.states, ...found.map((f) => f.state).filter((s) => !wf.states.includes(s))];
  return ordered.map((state) => {
    const hit = found.find((f) => f.state === state);
    return {
      state,
      label: stateLabel(state) || 'No State',
      count: hit?.count ?? 0,
      ddi: hit?.ddi ?? 0,
      terminal: state !== '' && !open.has(state),
    };
  });
}

export interface FicheKpi {
  total: number;
  ddi_total: number;
  avg_coefficient: number | null;
  unique_clients: number;
  lines: number;
  verified: number;
  audited: number;
  today: number;
  this_week: number;
  this_month: number;
  this_year: number;
}

async function kpi(): Promise<FicheKpi> {
  const res = await db.execute(sql`
    WITH b AS (${BASE})
    SELECT count(*)::int AS total,
           COALESCE(SUM(b.ddi), 0)::float AS ddi_total,
           AVG(b.coefficient)::float AS avg_coefficient,
           count(DISTINCT b.client_id)::int AS unique_clients,
           COALESCE(SUM(b.lines), 0)::int AS lines,
           count(*) FILTER (WHERE b.verified_at IS NOT NULL)::int AS verified,
           count(*) FILTER (WHERE b.audited_at IS NOT NULL)::int AS audited,
           count(*) FILTER (WHERE b.fiche_day = current_date)::int AS today,
           count(*) FILTER (WHERE date_trunc('week', b.fiche_day) = date_trunc('week', current_date))::int AS this_week,
           count(*) FILTER (WHERE date_trunc('month', b.fiche_day) = date_trunc('month', current_date))::int AS this_month,
           count(*) FILTER (WHERE date_trunc('year', b.fiche_day) = date_trunc('year', current_date))::int AS this_year
      FROM b`);
  return rowsOf<FicheKpi>(res)[0];
}

export interface Distribution {
  label: string;
  count: number;
  cif: number;
  ddi: number;
}

async function distributionBy(column: SQL, nullLabel: string): Promise<Distribution[]> {
  const res = await db.execute(sql`
    WITH b AS (${BASE})
    SELECT COALESCE(${column}, ${nullLabel}) AS label,
           count(*)::int AS count,
           COALESCE(SUM(b.cif), 0)::float AS cif,
           COALESCE(SUM(b.ddi), 0)::float AS ddi
      FROM b
     GROUP BY 1
     ORDER BY count DESC, ddi DESC`);
  return rowsOf<Distribution>(res);
}

export interface MonthPoint {
  month_short: string;
  /** Fiches dated in the month. */
  count: number;
  ddi: number;
  /** Fiches verified / audited in the month, by their own timestamps. */
  verified: number;
  audited: number;
}

async function monthly(): Promise<MonthPoint[]> {
  const res = await db.execute(sql`
    WITH b AS (${BASE}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           (SELECT count(*) FROM b WHERE date_trunc('month', b.fiche_day) = months.m)::int AS count,
           (SELECT COALESCE(SUM(b.ddi), 0) FROM b WHERE date_trunc('month', b.fiche_day) = months.m)::float AS ddi,
           (SELECT count(*) FROM b WHERE date_trunc('month', b.verified_at) = months.m)::int AS verified,
           (SELECT count(*) FROM b WHERE date_trunc('month', b.audited_at) = months.m)::int AS audited
      FROM months
     ORDER BY months.m`);
  return rowsOf<MonthPoint>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

export interface FicheOverview {
  kpi: FicheKpi;
  states: StateCount[];
  monthly: MonthPoint[];
  /** CIF per currency — the only honest way to total it. */
  currencies: Distribution[];
  regimes: Distribution[];
  transports: Distribution[];
  rows: FicheRow[];
}

export async function getFicheOverview(): Promise<FicheOverview> {
  const wf = await ficheWorkflow();
  const [k, states, months, currencies, regimes, transports, rows] = await Promise.all([
    kpi(),
    stateCounts(wf),
    monthly(),
    distributionBy(sql`b.currency`, 'USD'),
    distributionBy(sql`b.regime`, 'Not specified'),
    distributionBy(sql`b.transport_mode`, 'Not specified'),
    getFicheRows(),
  ]);
  return { kpi: k, states, monthly: months, currencies, regimes, transports, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────────────────────

export interface AgeBucket {
  band: AgeBand;
  label: string;
  count: number;
}

export interface Person {
  label: string;
  count: number;
}

export interface FicheWorkflowTab {
  states: StateCount[];
  ageing: AgeBucket[];
  monthly: MonthPoint[];
  verifiers: Person[];
  auditors: Person[];
  verified: number;
  audited: number;
  avg_days_to_verify: number | null;
  avg_days_to_audit: number | null;
  /** Fiches in an open state (or none) — the work still to do. */
  waiting: FicheRow[];
}

const AGE_LABELS: Array<{ band: AgeBand; label: string }> = [
  { band: 'D0_7', label: '0–7 days' },
  { band: 'D8_30', label: '8–30 days' },
  { band: 'D31_60', label: '31–60 days' },
  { band: 'D60_PLUS', label: 'Over 60 days' },
];

async function peopleBy(name: SQL, stamp: SQL): Promise<Person[]> {
  const res = await db.execute(sql`
    WITH b AS (${BASE})
    SELECT COALESCE(${name}, 'Unknown user') AS label, count(*)::int AS count
      FROM b WHERE ${stamp} IS NOT NULL
     GROUP BY 1 ORDER BY count DESC, label`);
  return rowsOf<Person>(res);
}

export async function getFicheWorkflowTab(): Promise<FicheWorkflowTab> {
  const wf = await ficheWorkflow();
  const [states, months, verifiers, auditors, waiting, timing] = await Promise.all([
    stateCounts(wf),
    monthly(),
    peopleBy(sql`b.verified_by_name`, sql`b.verified_at`),
    peopleBy(sql`b.audited_by_name`, sql`b.audited_at`),
    getFicheRows(wf),
    db.execute(sql`
      WITH b AS (${BASE})
      SELECT count(*) FILTER (WHERE b.verified_at IS NOT NULL)::int AS verified,
             count(*) FILTER (WHERE b.audited_at IS NOT NULL)::int AS audited,
             AVG(EXTRACT(EPOCH FROM (b.verified_at - b.created_at)) / 86400)::float AS avg_days_to_verify,
             AVG(EXTRACT(EPOCH FROM (b.audited_at - b.created_at)) / 86400)::float AS avg_days_to_audit
        FROM b`),
  ]);
  const t = rowsOf<{
    verified: number;
    audited: number;
    avg_days_to_verify: number | null;
    avg_days_to_audit: number | null;
  }>(timing)[0];

  // Every band is present, even an empty one, so the cards are stable.
  const ageing = AGE_LABELS.map(({ band, label }) => ({
    band,
    label,
    count: waiting.filter((r) => r.age_band === band).length,
  }));

  return {
    states,
    ageing,
    monthly: months,
    verifiers,
    auditors,
    verified: t.verified,
    audited: t.audited,
    avg_days_to_verify: t.avg_days_to_verify,
    avg_days_to_audit: t.avg_days_to_audit,
    waiting,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientSummary {
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  count: number;
  /** The currencies this client's CIF is in, e.g. "USD" or "EUR, USD". */
  currencies: string;
  cif: number;
  ddi: number;
  avg_ddi: number;
  share_pct: number;
  last_date: string | null;
}

export interface FicheClients {
  total_clients: number;
  ddi_total: number;
  count_total: number;
  clients: ClientSummary[];
}

export async function getFicheClients(): Promise<FicheClients> {
  const res = await db.execute(sql`
    WITH b AS (${BASE}),
         g AS (SELECT COALESCE(SUM(b.ddi), 0) AS grand FROM b)
    SELECT b.client_id,
           max(b.client_name) AS client_name,
           max(b.client_company) AS client_company,
           count(*)::int AS count,
           string_agg(DISTINCT b.currency, ', ') AS currencies,
           COALESCE(SUM(b.cif), 0)::float AS cif,
           COALESCE(SUM(b.ddi), 0)::float AS ddi,
           COALESCE(AVG(b.ddi), 0)::float AS avg_ddi,
           CASE WHEN g.grand > 0 THEN (SUM(b.ddi) * 100 / g.grand)::float ELSE 0 END AS share_pct,
           to_char(max(b.fiche_day), 'YYYY-MM-DD') AS last_date
      FROM b CROSS JOIN g
     GROUP BY b.client_id, g.grand
     ORDER BY ddi DESC, count DESC`);
  const clients = rowsOf<ClientSummary>(res);
  return {
    total_clients: clients.length,
    ddi_total: clients.reduce((s, c) => s + c.ddi, 0),
    count_total: clients.reduce((s, c) => s + c.count, 0),
    clients,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duties & HS codes
// ─────────────────────────────────────────────────────────────────────────────

export interface HsCodeSummary {
  hs_code: string;
  description: string | null;
  lines: number;
  fiches: number;
  ddi: number;
  avg_ddi_percent: number;
}

export interface OriginSummary {
  label: string;
  lines: number;
  ddi: number;
}

export interface FicheDuties {
  lines: number;
  ddi_total: number;
  avg_ddi_percent: number | null;
  distinct_hs: number;
  lines_without_hs: number;
  hs_codes: HsCodeSummary[];
  origins: OriginSummary[];
}

/** One row per fiche line, from the live fiches only. */
const LINES: SQL = sql`
  SELECT b.id AS fiche_id,
         NULLIF(trim(e->>'position_tarif'), '') AS hs_code,
         NULLIF(trim(e->>'description_tarif'), '') AS description,
         NULLIF(upper(trim(e->>'org')), '') AS origin,
         ${lineNum('ddi')} AS ddi,
         ${lineNum('ddi_percent')} AS ddi_percent
    FROM b CROSS JOIN LATERAL jsonb_array_elements(b.items) e`;

export async function getFicheDuties(): Promise<FicheDuties> {
  const [summary, hs, origins] = await Promise.all([
    db.execute(sql`
      WITH b AS (${BASE}), ln AS (${LINES})
      SELECT count(*)::int AS lines,
             COALESCE(SUM(ln.ddi), 0)::float AS ddi_total,
             AVG(ln.ddi_percent)::float AS avg_ddi_percent,
             count(DISTINCT ln.hs_code)::int AS distinct_hs,
             count(*) FILTER (WHERE ln.hs_code IS NULL)::int AS lines_without_hs
        FROM ln`),
    db.execute(sql`
      WITH b AS (${BASE}), ln AS (${LINES})
      SELECT COALESCE(ln.hs_code, 'Not specified') AS hs_code,
             max(ln.description) AS description,
             count(*)::int AS lines,
             count(DISTINCT ln.fiche_id)::int AS fiches,
             COALESCE(SUM(ln.ddi), 0)::float AS ddi,
             COALESCE(AVG(ln.ddi_percent), 0)::float AS avg_ddi_percent
        FROM ln
       GROUP BY 1
       ORDER BY ddi DESC, lines DESC`),
    db.execute(sql`
      WITH b AS (${BASE}), ln AS (${LINES})
      SELECT COALESCE(ln.origin, 'Not specified') AS label,
             count(*)::int AS lines,
             COALESCE(SUM(ln.ddi), 0)::float AS ddi
        FROM ln
       GROUP BY 1
       ORDER BY ddi DESC, lines DESC`),
  ]);
  const s = rowsOf<Omit<FicheDuties, 'hs_codes' | 'origins'>>(summary)[0];
  return { ...s, hs_codes: rowsOf<HsCodeSummary>(hs), origins: rowsOf<OriginSummary>(origins) };
}

// ─────────────────────────────────────────────────────────────────────────────

/** One tab's data — the tab route's only call. */
export async function getFicheDashboardTab(
  tab: FicheDashboardTab,
): Promise<FicheOverview | FicheWorkflowTab | FicheClients | FicheDuties> {
  switch (tab) {
    case 'overview':
      return getFicheOverview();
    case 'workflow':
      return getFicheWorkflowTab();
    case 'clients':
      return getFicheClients();
    case 'duties':
      return getFicheDuties();
  }
}
