// Data Import — what can be imported, what a target's fields are, and what
// happened to each uploaded row.
//
// The important decision is in `commitRows`: a row is created by POSTing it to
// the module's OWN endpoint — /api/v1/pages/{slug}/new for a transaction page,
// /api/v1/users for a user — with the operator's own cookie. So the importer
// has no write path of its own: every validation, derive, uniqueness check,
// audit entry and notification fires exactly as if the form had been filled in
// by hand, and nothing in those modules had to change to support importing.
//
// The cost is one request per row, which is why MAX_IMPORT_ROWS is modest and
// each row reports its own outcome rather than failing the batch.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { normaliseHeading, type TargetField } from '@/lib/dataImport/mapping';

type Rows<T> = { rows: T[] };

export interface ImportTarget {
  id: number;
  target_key: string;
  name: string;
  handler: 'page' | 'users';
  page_slug: string | null;
  menu_url: string;
  hint: string | null;
}

/** Field types the importer can fill from a cell. A grid or a file cannot be. */
const IMPORTABLE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'number', 'date', 'select']);

export async function listImportTargets(): Promise<ImportTarget[]> {
  const rows = await db.execute(sql`
    SELECT t.id, t.target_key, t.name, t.handler, t.page_slug, t.menu_url, t.hint
    FROM import_target_master_t t
    WHERE t.display = 'Y'
      -- A page target whose page has been switched off is not offered.
      AND (t.page_slug IS NULL OR EXISTS (
        SELECT 1 FROM master_page_t p WHERE p.slug = t.page_slug AND p.display = 'Y'))
    ORDER BY t.display_order, t.id`);
  return (rows as unknown as Rows<ImportTarget>).rows;
}

export async function getImportTarget(targetKey: string): Promise<ImportTarget> {
  const rows = await db.execute(sql`
    SELECT id, target_key, name, handler, page_slug, menu_url, hint
    FROM import_target_master_t WHERE target_key = ${targetKey} AND display = 'Y'`);
  const target = (rows as unknown as Rows<ImportTarget>).rows[0];
  if (!target) throw new NotFoundError('That module cannot be imported into — choose another from the list.');
  return target;
}

/**
 * The fields of the users API, which has no page metadata. Vetted here rather
 * than derived, because it is code that decides what a user row may carry.
 */
const USER_FIELDS: TargetField[] = [
  { name: 'full_name', label: 'Full Name', type: 'text', required: true },
  { name: 'username', label: 'Username', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'mobile', label: 'Mobile', type: 'tel', required: false },
  { name: 'role_id', label: 'Role', type: 'select', required: true, optionsSource: 'roles', optionsLabelField: 'role_name' },
  { name: 'location_id', label: 'Location', type: 'select', required: false, optionsSource: 'main-offices', optionsLabelField: 'main_location_name' },
  { name: 'dept_id', label: 'Department', type: 'select', required: false, optionsSource: 'departments', optionsLabelField: 'department_name' },
  { name: 'password', label: 'Password', type: 'text', required: false },
];

/**
 * A target's importable fields.
 *
 * For a page target they ARE the page's fields (§4.12), so a field added to a
 * form is importable the same day, with its own label, type and options. A
 * read-only or computed field is left out: the module fills it itself.
 */
export async function importTargetFields(target: ImportTarget): Promise<TargetField[]> {
  if (target.handler === 'users') return USER_FIELDS;

  const rows = await db.execute(sql`
    SELECT f.name, f.label, f.field_type, f.required, f.options_source, f.options_label_field,
           a.slug AS accordion, f.props, f.derive
    FROM master_page_accordion_field_t f
    JOIN master_page_accordion_t a ON a.id = f.accordion_id
    JOIN master_page_t p ON p.id = a.page_id
    WHERE p.slug = ${target.page_slug} AND p.display = 'Y' AND a.display = 'Y' AND f.display = 'Y'
    ORDER BY a.display_order, f.display_order`);
  type Row = {
    name: string; label: string; field_type: string; required: boolean;
    options_source: string | null; options_label_field: string | null; accordion: string;
    props: Record<string, unknown> | null; derive: Record<string, unknown> | null;
  };
  return (rows as unknown as Rows<Row>).rows
    .filter((r) => IMPORTABLE_TYPES.has(r.field_type))
    .filter((r) => r.props?.['readOnly'] !== true)
    // A field the form computes or fetches for itself is not asked of the file;
    // an editable prefill still is, because the operator may override it.
    .filter((r) => r.derive == null || r.derive['editable'] === true)
    .map((r) => ({
      name: r.name,
      label: r.label,
      type: r.field_type,
      required: r.required,
      optionsSource: r.options_source,
      optionsLabelField: r.options_label_field,
      accordion: r.accordion,
    }));
}

// ---------------------------------------------------------------------------
// ALIASES — headings the importer has been taught
// ---------------------------------------------------------------------------

export async function loadAliases(targetId: number): Promise<Record<string, string>> {
  const rows = await db.execute(sql`
    SELECT alias, field_name FROM import_field_alias_master_t WHERE target_id = ${targetId}`);
  return Object.fromEntries(
    (rows as unknown as Rows<{ alias: string; field_name: string }>).rows.map((r) => [r.alias, r.field_name]),
  );
}

/** Remember this file's headings, so the next upload maps itself. */
export async function rememberAliases(
  targetId: number,
  mapping: Record<string, string | null>,
  actorId: number,
): Promise<void> {
  const pairs = Object.entries(mapping)
    .filter(([heading, field]) => field && normaliseHeading(heading) !== '')
    .map(([heading, field]) => ({ alias: normaliseHeading(heading), field: field as string }));
  if (pairs.length === 0) return;
  await db.execute(sql`
    INSERT INTO import_field_alias_master_t (target_id, field_name, alias, created_by)
    VALUES ${sql.join(pairs.map((p) => sql`(${targetId}, ${p.field}, ${p.alias}, ${actorId})`), sql`, `)}
    ON CONFLICT (target_id, alias) DO UPDATE SET field_name = excluded.field_name`);
}

// ---------------------------------------------------------------------------
// OPTION LOOKUP — a spreadsheet says "NMI", the module wants the id
// ---------------------------------------------------------------------------

export interface CommitContext {
  /** Where to post — this request's own origin. */
  origin: string;
  /** The operator's cookie, so each write is made AS them, with their permissions. */
  cookie: string;
}

type OptionMap = Map<string, string>;

/**
 * label → id for one option source, read through the same endpoint the form's
 * dropdown reads. Both the label and the id are accepted in the file, so a
 * sheet exported from this app (ids) and one typed by a person (names) both work.
 */
async function loadOptions(ctx: CommitContext, source: string, labelField: string | null): Promise<OptionMap> {
  const map: OptionMap = new Map();
  const res = await fetch(`${ctx.origin}/api/v1/${source}${source.includes('?') ? '&' : '?'}pageSize=100`, {
    headers: { cookie: ctx.cookie },
  });
  if (!res.ok) return map;
  const body = (await res.json()) as { ok?: boolean; data?: unknown };
  const raw = body.data as unknown;
  const list = (Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown[] })?.items) ? (raw as { items: unknown[] }).items : []) as Record<string, unknown>[];
  for (const row of list) {
    const id = row['id'];
    if (id === undefined || id === null) continue;
    map.set(String(id).toUpperCase(), String(id));
    for (const key of [labelField ?? 'name', 'name', 'short_name', 'company_name']) {
      const label = row[key];
      if (typeof label === 'string' && label.trim() !== '') map.set(label.trim().toUpperCase(), String(id));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// COMMIT
// ---------------------------------------------------------------------------

export interface CommitRow {
  row_number: number;
  values: Record<string, string>;
}

export interface CommitResult {
  row_number: number;
  record_id: number | null;
  error: string | null;
  values: Record<string, unknown>;
}

/** Create every row through the module's own endpoint, reporting each outcome. */
export async function commitRows(
  target: ImportTarget,
  fields: TargetField[],
  rows: CommitRow[],
  ctx: CommitContext,
): Promise<CommitResult[]> {
  const optionMaps = new Map<string, OptionMap>();
  for (const field of fields) {
    if (field.type !== 'select' || !field.optionsSource || optionMaps.has(field.optionsSource)) continue;
    optionMaps.set(field.optionsSource, await loadOptions(ctx, field.optionsSource, field.optionsLabelField ?? null));
  }

  const byName = new Map(fields.map((f) => [f.name, f]));
  const results: CommitResult[] = [];

  for (const row of rows) {
    const values: Record<string, unknown> = {};
    let problem: string | null = null;

    for (const [name, raw] of Object.entries(row.values)) {
      const field = byName.get(name);
      if (!field) continue;
      const text = String(raw ?? '').trim();
      if (text === '') continue;

      if (field.type === 'select' && field.optionsSource) {
        const id = optionMaps.get(field.optionsSource)?.get(text.toUpperCase());
        if (!id) {
          // Named, not "invalid": the operator has to find this value in the file.
          problem = `${field.label}: "${text}" is not one of the options — add it to the master first, or correct the cell.`;
          break;
        }
        values[name] = Number(id);
      } else if (field.type === 'number') {
        const n = Number(text.replace(/[\s,]/gu, ''));
        if (!Number.isFinite(n)) {
          problem = `${field.label}: "${text}" is not a number.`;
          break;
        }
        values[name] = n;
      } else {
        values[name] = text;
      }
    }

    if (problem) {
      results.push({ row_number: row.row_number, record_id: null, error: problem, values });
      continue;
    }

    try {
      const recordId = await createRecord(target, fields, values, ctx);
      results.push({ row_number: row.row_number, record_id: recordId, error: null, values });
    } catch (err) {
      results.push({
        row_number: row.row_number,
        record_id: null,
        error: err instanceof Error ? err.message : 'The module refused this row.',
        values,
      });
    }
  }
  return results;
}

/** A temporary password for an imported user who was given none. */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

async function createRecord(
  target: ImportTarget,
  fields: TargetField[],
  values: Record<string, unknown>,
  ctx: CommitContext,
): Promise<number> {
  const post = async (path: string, body: unknown): Promise<{ ok: boolean; id?: number; message: string }> => {
    const res = await fetch(`${ctx.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ctx.cookie },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: { id?: number }; error?: { message?: string } }
      | null;
    if (res.ok && json?.ok) return { ok: true, id: json.data?.id, message: '' };
    return { ok: false, message: json?.error?.message ?? `The module refused this row (${res.status}).` };
  };

  if (target.handler === 'users') {
    const result = await post('/api/v1/users', { ...values, password: values['password'] ?? temporaryPassword() });
    if (!result.ok || !result.id) throw new Error(result.message);
    return result.id;
  }

  // A transaction page saves by accordion, so the values are grouped the way the
  // form would have sent them (§4.17).
  const byAccordion = new Map<string, Record<string, unknown>>();
  for (const [name, value] of Object.entries(values)) {
    const accordion = fields.find((f) => f.name === name)?.accordion;
    if (!accordion) continue;
    const bucket = byAccordion.get(accordion) ?? {};
    bucket[name] = value;
    byAccordion.set(accordion, bucket);
  }
  const accordions = [...byAccordion.entries()].map(([slug, v]) => ({ slug, values: v }));
  if (accordions.length === 0) throw new Error('This row has no value the module can store.');

  const result = await post(`/api/v1/pages/${target.page_slug}/new`, { accordions });
  if (!result.ok || !result.id) throw new Error(result.message);
  return result.id;
}

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

export async function recordBatch(input: {
  targetKey: string;
  fileName: string;
  source: 'spreadsheet' | 'document';
  mapping: Record<string, string | null> | null;
  results: CommitResult[];
  actorId: number;
}): Promise<number> {
  const created = input.results.filter((r) => r.record_id !== null).length;
  const failed = input.results.length - created;
  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO import_batch_t (target_key, file_name, source, status, row_count, created_count, failed_count, mapping, created_by)
      VALUES (${input.targetKey}, ${input.fileName}, ${input.source},
              ${failed === 0 ? 'committed' : created === 0 ? 'failed' : 'committed'},
              ${input.results.length}, ${created}, ${failed},
              ${input.mapping ? JSON.stringify(input.mapping) : null}, ${input.actorId})
      RETURNING id`);
    const batchId = (inserted as unknown as Rows<{ id: number }>).rows[0]!.id;
    if (input.results.length > 0) {
      await tx.execute(sql`
        INSERT INTO import_batch_row_t (batch_id, row_number, values, record_id, error)
        VALUES ${sql.join(
          input.results.map(
            (r) => sql`(${batchId}, ${r.row_number}, ${JSON.stringify(r.values)}, ${r.record_id}, ${r.error})`,
          ),
          sql`, `,
        )}`);
    }
    return batchId;
  });
}

export interface BatchRow {
  id: number;
  target_key: string;
  target_name: string | null;
  file_name: string;
  source: string;
  row_count: number;
  created_count: number;
  failed_count: number;
  created_by_name: string | null;
  created_at: string;
}

export async function listBatches(limit = 100): Promise<BatchRow[]> {
  const rows = await db.execute(sql`
    SELECT b.id, b.target_key, t.name AS target_name, b.file_name, b.source,
           b.row_count, b.created_count, b.failed_count,
           u.full_name AS created_by_name,
           to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
    FROM import_batch_t b
    LEFT JOIN import_target_master_t t ON t.target_key = b.target_key
    LEFT JOIN users_t u ON u.id = b.created_by
    ORDER BY b.id DESC
    LIMIT ${limit}`);
  return (rows as unknown as Rows<BatchRow>).rows;
}

export async function batchRows(batchId: number): Promise<{ row_number: number; record_id: number | null; error: string | null; values: unknown }[]> {
  const rows = await db.execute(sql`
    SELECT row_number, record_id, error, values FROM import_batch_row_t
    WHERE batch_id = ${batchId} ORDER BY row_number`);
  return (rows as unknown as Rows<{ row_number: number; record_id: number | null; error: string | null; values: unknown }>).rows;
}
