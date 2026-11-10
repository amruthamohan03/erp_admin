// AI Search — the ONLY data the assistant can read.
//
// The model never writes SQL. It picks one of the lookups below by name, with
// typed arguments, and each lookup reads a fixed shape over the modules the
// caller's role may VIEW (§4.7). A question about a module the role cannot open
// gets "no access", never the rows — the assistant is a faster way to reach what
// the screens already show this person, not a way around them.
//
// Every status here is the one the screens show, through their own definitions:
// licence expiry via licenseFilters, invoice validation via invoiceBase, payment
// stage via paymentStatusSql. A second definition here would let the assistant
// and the list disagree about the same record (§4.10).
//
// Access is TWO checks, the same two every list screen makes:
//   1. which modules — the role's menu grants (§4.7);
//   2. which rows    — a client login sees only its own client's rows
//                      (lib/auth/clientScope). Without this, a client user could
//                      ask about another client's files and be told.
// Both are carried in `AiAccess`, and every SELECT below is built from one of
// the per-module builders, each of which ANDs the client predicate in — so a new
// lookup cannot be written without it.
import { and, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkPermission } from '@/lib/auth/permissions';
import { clientScopeCondition, resolveClientScope, type ClientScope } from '@/lib/auth/clientScope';
import type { AuthPayload } from '@/lib/auth';
import { EFFECTIVE_STATUS, IS_EXPIRED, IS_EXPIRING, IS_LIVE, EXPIRING_WINDOW_DAYS } from './licenseFilters';
import { invoiceBase } from './invoiceDashboardTabs';
import { paymentStatusSql } from './payments';
import { loadPaymentStages } from './paymentStages';
import { pageRecordDisplay } from './pageExport';

type Rows<T> = { rows: T[] };

/** What the assistant can look in. Each is gated by the menu its list lives on. */
export const AI_MODULES = {
  import_license: { label: 'Import Licence', url: '/licenses', slug: 'license' },
  export_license: { label: 'Export Licence', url: '/export-licenses', slug: 'export-license' },
  import: { label: 'Import Tracking', url: '/imports', slug: 'import' },
  export: { label: 'Export Tracking', url: '/exports', slug: 'export' },
  local: { label: 'Local Tracking', url: '/local', slug: 'local' },
  import_invoice: { label: 'Import Invoice', url: '/import-invoices', slug: 'import-invoices' },
  export_invoice: { label: 'Export Invoice', url: '/export-invoices', slug: 'export-invoices' },
  payment: { label: 'Payment Request', url: '/payments', slug: 'payment' },
} as const;
export type AiModule = keyof typeof AI_MODULES;
export const AI_MODULE_KEYS = Object.keys(AI_MODULES) as AiModule[];

/** One record as the answer panel draws it: a card with a badge and a link. */
export interface AiRecord {
  module: AiModule;
  module_label: string;
  id: number;
  reference: string | null;
  client: string | null;
  status: string | null;
  /** The record's headline date (expiry, creation…), ISO. */
  date: string | null;
  date_label: string | null;
  link: string;
}

/** What one caller may see: the modules, and the rows within them. */
export interface AiAccess {
  modules: Set<AiModule>;
  scope: ClientScope;
}

/**
 * Decided afresh for EVERY question, including a follow-up in an old
 * conversation — a role that lost a module, or an account newly tied to a
 * client, is held to that on its very next turn, not when it starts a new chat.
 */
export async function resolveAiAccess(session: AuthPayload): Promise<AiAccess> {
  const modules = new Set<AiModule>();
  for (const key of AI_MODULE_KEYS) {
    if (await checkPermission(session, AI_MODULES[key].url, 'view')) modules.add(key);
  }
  return { modules, scope: await resolveClientScope(session) };
}

/** The client predicate for a row's own client column. */
function scoped(access: AiAccess, clientColumn: SQL): SQL {
  return clientScopeCondition(access.scope, clientColumn);
}

// ---------------------------------------------------------------------------
// Matching a reference the way a person types it
// ---------------------------------------------------------------------------

/**
 * A reference reduced to what identifies it: upper-case, letters and digits
 * only, leading zeros of each number dropped. So `ACSELC-IDDIA-26-1`,
 * `acselc iddia 26 0001` and `ACSELC-IDDIA26-0001` all compare equal — people
 * quote references from memory, from a phone, from a PDF.
 */
export function normaliseReference(raw: string): string {
  // Zeros first, while separators still mark where each number starts: only a
  // number's PADDING goes (0001 → 1), never a zero that is part of its value
  // (100 stays 100). Removing separators first would glue "26-0001" into one
  // number and lose that boundary.
  return raw
    .toUpperCase()
    .replace(/(^|[^0-9])0+(?=[0-9])/g, '$1')
    .replace(/[^A-Z0-9]/g, '');
}

/** The same reduction, in SQL, so the column is compared on equal terms. */
function normSql(col: SQL): SQL {
  return sql`regexp_replace(regexp_replace(upper(coalesce(${col}::text, '')), '(^|[^0-9])0+([0-9])', '\\1\\2', 'g'), '[^A-Z0-9]', '', 'g')`;
}

/** Does any of `cols` contain the reference? Exact matches rank first. */
function refMatch(cols: SQL[], needle: string): { where: SQL; rank: SQL } {
  const exact = sql.join(cols.map((c) => sql`${normSql(c)} = ${needle}`), sql` OR `);
  const like = sql.join(cols.map((c) => sql`${normSql(c)} LIKE ${`%${needle}%`}`), sql` OR `);
  return { where: sql`(${like})`, rank: sql`CASE WHEN ${exact} THEN 0 ELSE 1 END` };
}

/** A client given by code or by name — what an operator would say. */
function clientMatch(alias: string, client?: string | null): SQL {
  if (!client?.trim()) return sql`TRUE`;
  const like = `%${client.trim()}%`;
  return sql`${sql.raw(alias)}.client_id IN (
    SELECT id FROM client_master_t WHERE short_name ILIKE ${client.trim()} OR company_name ILIKE ${like})`;
}

function dateRange(col: SQL, from?: string | null, to?: string | null): SQL {
  const parts: SQL[] = [];
  if (from) parts.push(sql`${col}::date >= ${from}::date`);
  if (to) parts.push(sql`${col}::date <= ${to}::date`);
  return parts.length ? sql.join(parts, sql` AND `) : sql`TRUE`;
}

interface RawRow {
  module: AiModule;
  id: number;
  reference: string | null;
  client: string | null;
  status: string | null;
  /** Formatted `YYYY-MM-DD` in SQL: a pg `date` read into a JS Date is local
   *  midnight, and serialising it can land on the previous day. */
  date: string | null;
  date_label: string | null;
}

function toRecord(r: RawRow): AiRecord {
  const m = AI_MODULES[r.module];
  return {
    module: r.module,
    module_label: m.label,
    id: Number(r.id),
    reference: r.reference,
    client: r.client,
    status: r.status,
    date: r.date,
    date_label: r.date_label,
    link: `${m.url}/${r.id}`,
  };
}

/** Which licences are export-side: the kind is flagged for export and not import. */
const LICENSE_IS_EXPORT = sql`EXISTS (SELECT 1 FROM kind_master_t k WHERE k.id = license_t.kind_id AND k.use_for_export IS TRUE AND k.use_for_import IS NOT TRUE)`;

// ---------------------------------------------------------------------------
// The per-module shapes, each a SELECT producing RawRow columns
// ---------------------------------------------------------------------------

function licenseSelect(access: AiAccess, side: 'import' | 'export', where: SQL, rank: SQL = sql`0`): SQL {
  const key: AiModule = side === 'import' ? 'import_license' : 'export_license';
  return sql`
    SELECT ${key}::text AS module, license_t.id, license_t.license_number AS reference,
           c.short_name AS client, ${EFFECTIVE_STATUS} AS status,
           to_char(license_t.license_expiry_date, 'YYYY-MM-DD') AS date, 'Expires'::text AS date_label, ${rank} AS rank
      FROM license_t LEFT JOIN client_master_t c ON c.id = license_t.client_id
     WHERE license_t.display = 'Y'
       AND ${scoped(access, sql`license_t.client_id`)}
       AND ${side === 'export' ? LICENSE_IS_EXPORT : sql`NOT ${LICENSE_IS_EXPORT}`}
       AND ${where}`;
}

const TRACKING = {
  import: { table: 'imports_t', refs: ['mca_ref', 'declaration_reference', 'license_invoice_number', 'po_ref', 'invoice'] },
  export: { table: 'exports_t', refs: ['mca_ref', 'declaration_reference', 'lot_number', 'invoice', 'po_ref'] },
  local: { table: 'locals_t', refs: ['mca_lt_reference', 'lot_num'] },
} as const;
export type TrackingModule = keyof typeof TRACKING;

function trackingSelect(access: AiAccess, module: TrackingModule, where: SQL, rank: SQL = sql`0`): SQL {
  const t = TRACKING[module];
  const refCol = module === 'local' ? 'mca_lt_reference' : 'mca_ref';
  return sql`
    SELECT ${module}::text AS module, f.id, f.${sql.identifier(refCol)} AS reference,
           c.short_name AS client, cs.clearing_status AS status,
           to_char(f.created_at, 'YYYY-MM-DD') AS date, 'Created'::text AS date_label, ${rank} AS rank
      FROM ${sql.identifier(t.table)} f
      LEFT JOIN client_master_t c ON c.id = f.client_id
      LEFT JOIN clearing_status_master_t cs ON cs.id = f.clearing_status
     WHERE f.display = 'Y' AND ${scoped(access, sql`f.client_id`)} AND ${where}`;
}

function invoiceSelect(access: AiAccess, kind: 'import' | 'export', where: SQL, rank: SQL = sql`0`): SQL {
  const key: AiModule = kind === 'import' ? 'import_invoice' : 'export_invoice';
  return sql`
    SELECT ${key}::text AS module, b.id, b.invoice_ref AS reference, b.client_name AS client,
           b.status, to_char(b.inv_date, 'YYYY-MM-DD') AS date, 'Created'::text AS date_label, ${rank} AS rank
      FROM (${invoiceBase(kind)}) b
     WHERE ${scoped(access, sql`b.client_id`)} AND ${where}`;
}

/** One builder for payment rows — findRecords and findRecordById both read it. */
async function paymentSelect(access: AiAccess, where: SQL, rank: SQL = sql`0`): Promise<SQL> {
  const stages = await loadPaymentStages();
  return sql`
    SELECT 'payment'::text AS module, pr.id, pr.mca_ref AS reference, c.short_name AS client,
           ${paymentStatusSql(stages)} AS status, to_char(pr.created_at, 'YYYY-MM-DD') AS date, 'Requested'::text AS date_label, ${rank} AS rank
      FROM payment_request_t pr LEFT JOIN client_master_t c ON c.id = pr.client_id
     WHERE pr.display = 'Y' AND ${scoped(access, sql`pr.client_id`)} AND ${where}`;
}

// ---------------------------------------------------------------------------
// The lookups the assistant calls
// ---------------------------------------------------------------------------

/** Find any record by a reference, across every module the caller may view. */
export async function findRecords(access: AiAccess, reference: string, limit = 10): Promise<AiRecord[]> {
  const needle = normaliseReference(reference);
  if (needle.length < 2) return [];
  const allowed = access.modules;
  const parts: SQL[] = [];
  for (const side of ['import', 'export'] as const) {
    if (!allowed.has(side === 'import' ? 'import_license' : 'export_license')) continue;
    const m = refMatch([sql`license_t.license_number`, sql`license_t.mca_ref`, sql`license_t.invoice_number`, sql`license_t.ref_cod`], needle);
    parts.push(licenseSelect(access, side, m.where, m.rank));
  }
  for (const mod of ['import', 'export', 'local'] as const) {
    if (!allowed.has(mod)) continue;
    const m = refMatch(TRACKING[mod].refs.map((c) => sql`f.${sql.identifier(c)}`), needle);
    parts.push(trackingSelect(access, mod, m.where, m.rank));
  }
  for (const kind of ['import', 'export'] as const) {
    if (!allowed.has(kind === 'import' ? 'import_invoice' : 'export_invoice')) continue;
    const m = refMatch([sql`b.invoice_ref`], needle);
    parts.push(invoiceSelect(access, kind, m.where, m.rank));
  }
  if (allowed.has('payment')) {
    const m = refMatch([sql`pr.mca_ref`], needle);
    parts.push(await paymentSelect(access, m.where, m.rank));
  }
  if (!parts.length) return [];
  const res = (await db.execute(sql`
    SELECT * FROM (${sql.join(parts, sql` UNION ALL `)}) u
     ORDER BY rank, date DESC NULLS LAST LIMIT ${limit}`)) as unknown as Rows<RawRow>;
  return labelPaymentStatuses(res.rows.map(toRecord));
}

/**
 * paymentStatusSql yields a key (`waiting_finance`); the screens show its
 * label — the same mapping `paymentStatus()` in lib/payments/stages makes.
 */
async function paymentStatusLabeler(): Promise<(key: string | null) => string | null> {
  const stages = await loadPaymentStages();
  return (key) => {
    if (key === 'rejected') return 'Rejected';
    if (key === 'paid') return stages.at(-1)?.label ?? 'Completed';
    return stages.find((x) => `waiting_${x.stage}` === key)?.pending_label ?? key;
  };
}

async function labelPaymentStatuses(records: AiRecord[]): Promise<AiRecord[]> {
  if (!records.some((r) => r.module === 'payment')) return records;
  const label = await paymentStatusLabeler();
  return records.map((r) => (r.module === 'payment' ? { ...r, status: label(r.status) } : r));
}

export const LICENSE_FILTERS = ['all', 'active', 'expiring', 'expired', 'annulated', 'modified', 'prorogated', 'inactive'] as const;
export type LicenseFilter = (typeof LICENSE_FILTERS)[number];

export interface LicenseQuery {
  side?: 'import' | 'export' | 'both';
  filter?: LicenseFilter;
  client?: string | null;
  /** For `expired`: only those whose expiry date fell within the last N days. */
  expired_within_days?: number | null;
  /** For `expiring`: the horizon in days (the screens use 30). */
  expiring_within_days?: number | null;
  limit?: number;
}

function licenseFilterSql(q: LicenseQuery): SQL {
  const f = q.filter ?? 'all';
  const parts: SQL[] = [clientMatch('license_t', q.client)];
  if (f === 'active') parts.push(IS_LIVE);
  if (f === 'expired') {
    parts.push(IS_EXPIRED);
    if (q.expired_within_days) {
      parts.push(sql`license_t.license_expiry_date >= current_date - ${q.expired_within_days}::int`);
    }
  }
  if (f === 'expiring') {
    const days = q.expiring_within_days ?? EXPIRING_WINDOW_DAYS;
    parts.push(days === EXPIRING_WINDOW_DAYS
      ? IS_EXPIRING
      : sql`(license_t.status = 'ACTIVE' AND license_t.license_expiry_date BETWEEN current_date AND current_date + ${days}::int)`);
  }
  if (['annulated', 'modified', 'prorogated', 'inactive'].includes(f)) parts.push(sql`license_t.status = ${f.toUpperCase()}`);
  return and(...parts) as SQL;
}

function licenseSides(access: AiAccess, side: LicenseQuery['side']): Array<'import' | 'export'> {
  const want: Array<'import' | 'export'> = side === 'import' ? ['import'] : side === 'export' ? ['export'] : ['import', 'export'];
  return want.filter((s) => access.modules.has(s === 'import' ? 'import_license' : 'export_license'));
}

/** Licences matching a status filter: the total, and the first `limit` of them. */
export async function listLicenses(
  access: AiAccess,
  q: LicenseQuery,
): Promise<{ total: number; records: AiRecord[]; denied: boolean }> {
  const sides = licenseSides(access, q.side);
  if (!sides.length) return { total: 0, records: [], denied: true };
  const where = licenseFilterSql(q);
  const union = sql.join(sides.map((s) => licenseSelect(access, s, where)), sql` UNION ALL `);
  // Expired: most recently lapsed first. Everything else: soonest to lapse first.
  const order = q.filter === 'expired' ? sql`date DESC NULLS LAST` : sql`date ASC NULLS LAST`;
  const res = (await db.execute(sql`
    SELECT *, count(*) OVER ()::int AS total FROM (${union}) u ORDER BY ${order} LIMIT ${q.limit ?? 10}`)) as unknown as Rows<
    RawRow & { total: number }
  >;
  // The window count is taken before LIMIT, so it is the full match count.
  return { total: res.rows[0]?.total ?? 0, records: res.rows.map(toRecord), denied: false };
}

/** Every licence status bucket at once — the licence dashboard's KPI row. */
export async function licenseSummary(
  access: AiAccess,
  q: Pick<LicenseQuery, 'side' | 'client'>,
): Promise<{ counts: Record<string, number>; denied: boolean }> {
  const sides = licenseSides(access, q.side);
  if (!sides.length) return { counts: {}, denied: true };
  const sideSql = sides.length === 2 ? sql`TRUE` : sides[0] === 'export' ? LICENSE_IS_EXPORT : sql`NOT ${LICENSE_IS_EXPORT}`;
  const res = (await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${IS_LIVE})::int AS active,
           count(*) FILTER (WHERE ${IS_EXPIRING})::int AS expiring_in_30_days,
           count(*) FILTER (WHERE ${IS_EXPIRED})::int AS expired,
           count(*) FILTER (WHERE ${IS_EXPIRED} AND license_t.license_expiry_date >= current_date - 30)::int AS expired_last_30_days,
           count(*) FILTER (WHERE license_t.status = 'ANNULATED')::int AS annulated,
           count(*) FILTER (WHERE license_t.status = 'MODIFIED')::int AS modified,
           count(*) FILTER (WHERE license_t.status = 'PROROGATED')::int AS prorogated,
           count(*) FILTER (WHERE license_t.status = 'INACTIVE')::int AS inactive
      FROM license_t
     WHERE license_t.display = 'Y' AND ${scoped(access, sql`license_t.client_id`)}
       AND ${sideSql} AND ${clientMatch('license_t', q.client)}`)) as unknown as Rows<
    Record<string, number>
  >;
  return { counts: res.rows[0] ?? {}, denied: false };
}

export interface TrackingQuery {
  module: TrackingModule;
  client?: string | null;
  /** Clearing status as the screens name it, e.g. "IN TRANSIT". Partial text is fine. */
  status?: string | null;
  created_from?: string | null;
  created_to?: string | null;
  limit?: number;
}

function trackingWhere(q: TrackingQuery): SQL {
  const parts: SQL[] = [clientMatch('f', q.client), dateRange(sql`f.created_at`, q.created_from, q.created_to)];
  if (q.status?.trim()) parts.push(sql`cs.clearing_status ILIKE ${`%${q.status.trim()}%`}`);
  return and(...parts) as SQL;
}

/** How many files sit in each clearing status. */
export async function trackingSummary(
  access: AiAccess,
  q: TrackingQuery,
): Promise<{ total: number; by_status: Array<{ status: string; count: number }>; denied: boolean }> {
  if (!access.modules.has(q.module)) return { total: 0, by_status: [], denied: true };
  const res = (await db.execute(sql`
    SELECT COALESCE(status, 'No status') AS status, count(*)::int AS count
      FROM (${trackingSelect(access, q.module, trackingWhere(q))}) u
     GROUP BY 1 ORDER BY 2 DESC`)) as unknown as Rows<{ status: string; count: number }>;
  return { total: res.rows.reduce((n, r) => n + r.count, 0), by_status: res.rows, denied: false };
}

/** Files matching the filters: the total, and the newest `limit` of them. */
export async function listTrackingFiles(
  access: AiAccess,
  q: TrackingQuery,
): Promise<{ total: number; records: AiRecord[]; denied: boolean }> {
  if (!access.modules.has(q.module)) return { total: 0, records: [], denied: true };
  const res = (await db.execute(sql`
    SELECT *, count(*) OVER ()::int AS total FROM (${trackingSelect(access, q.module, trackingWhere(q))}) u
     ORDER BY date DESC LIMIT ${q.limit ?? 10}`)) as unknown as Rows<RawRow & { total: number }>;
  return { total: res.rows[0]?.total ?? 0, records: res.rows.map(toRecord), denied: false };
}

/** Payment requests by the stage they wait on — the payments dashboard's split. */
export async function paymentSummary(
  access: AiAccess,
  q: { client?: string | null },
): Promise<{ total: number; by_status: Array<{ status: string; count: number }>; denied: boolean }> {
  if (!access.modules.has('payment')) return { total: 0, by_status: [], denied: true };
  const stages = await loadPaymentStages();
  const res = (await db.execute(sql`
    SELECT ${paymentStatusSql(stages)} AS status, count(*)::int AS count
      FROM payment_request_t pr
     WHERE pr.display = 'Y' AND ${scoped(access, sql`pr.client_id`)} AND ${clientMatch('pr', q.client)}
     GROUP BY 1 ORDER BY 2 DESC`)) as unknown as Rows<{ status: string; count: number }>;
  const label = await paymentStatusLabeler();
  return {
    total: res.rows.reduce((n, r) => n + r.count, 0),
    by_status: res.rows.map((r) => ({ status: label(r.status) ?? r.status, count: r.count })),
    denied: false,
  };
}

/**
 * Every filled field of one record, by the label its form gives it — the same
 * values the record view shows (dates DD-MM-YYYY, ids resolved to names).
 */
export async function recordDetails(
  access: AiAccess,
  module: AiModule,
  id: number,
): Promise<{ title: string; fields: Record<string, string>; record: AiRecord | null } | { denied: true } | null> {
  if (!access.modules.has(module)) return { denied: true };
  // Resolved through the SCOPED builder before anything is read: a record that
  // belongs to another client is "not found" to a client login — the assistant
  // cannot even confirm that it exists.
  const [record] = await findRecordById(access, module, id);
  if (!record) return null;
  const shown = await pageRecordDisplay(db, AI_MODULES[module].slug, id);
  if (!shown || String(shown.raw['display'] ?? 'Y') !== 'Y') return null;
  const fields: Record<string, string> = {};
  for (const [name, label] of Object.entries(shown.labels)) {
    const v = shown.values[name];
    if (v && v !== 'N/A' && v !== '—') fields[label] = v;
  }
  return { title: shown.title, fields, record };
}

async function findRecordById(access: AiAccess, module: AiModule, id: number): Promise<AiRecord[]> {
  const byId = (alias: string): SQL => sql`${sql.raw(alias)}.id = ${id}`;
  let select: SQL;
  if (module === 'import_license' || module === 'export_license') {
    select = licenseSelect(access, module === 'import_license' ? 'import' : 'export', sql`license_t.id = ${id}`);
  } else if (module === 'import' || module === 'export' || module === 'local') {
    select = trackingSelect(access, module, byId('f'));
  } else if (module === 'import_invoice' || module === 'export_invoice') {
    select = invoiceSelect(access, module === 'import_invoice' ? 'import' : 'export', byId('b'));
  } else {
    select = await paymentSelect(access, byId('pr'));
  }
  const res = (await db.execute(select)) as unknown as Rows<RawRow>;
  return labelPaymentStatuses(res.rows.map(toRecord));
}
