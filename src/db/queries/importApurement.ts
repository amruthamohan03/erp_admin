// Import Apurement queries (§7.4) — Import License → Import Apurement.
//
// A file is ELIGIBLE for apurement once it is a live, quitted import file
// (file reference set, quittance date set, not cancelled) on a live licence of
// an import kind (kind_master_t.use_for_import, §4.1 — the legacy screen
// hardcoded kinds 1, 2, 5, 6). Its status is derived, never stored:
//   pending — no transmission yet (with or without an apurement record)
//   ready   — pending, with an ASS REF, a Type, and a Remarque if the Type
//             requires one (apurement_option_master_t.requires_remark)
//   apured  — carried by a live transmission
import { sql, type SQL } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { fileNotCancelled } from '@/db/queries/fileCancellation';
import { generateReferences } from '@/db/queries/mcaRefGenerator';
import { recordAudit } from '@/lib/audit/recordAudit';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import type {
  ApuredListQuery,
  ApurementRowInput,
  TransmissionCreateInput,
  TransmissionListQuery,
} from '@/schemas/import-apurement';

type Executor = Database | Transaction;
type Row = Record<string, unknown>;

async function rows<T>(exec: Executor, query: SQL): Promise<T[]> {
  const result = await exec.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

// ---- Shared SQL fragments ------------------------------------------------------

/** `i` = imports_t, `l` = its licence. */
const ELIGIBLE = sql`
  i.display = 'Y'
  AND NULLIF(btrim(i.mca_ref), '') IS NOT NULL
  AND i.quittance_date IS NOT NULL
  AND ${fileNotCancelled(sql`i.clearing_status`)}
  AND l.display = 'Y'
  AND l.kind_id IN (SELECT k.id FROM kind_master_t k WHERE k.use_for_import)`;

/** `a` = the file's import_apurement_t row, if any. */
const PENDING = sql`(a.id IS NULL OR a.transmission_id IS NULL)`;

/** `ot` = the Type option. Ready to go into a transmission. */
const READY = sql`
  ${PENDING}
  AND NULLIF(btrim(a.ass_ref), '') IS NOT NULL
  AND a.clearance_type_id IS NOT NULL
  AND (NOT ot.requires_remark OR a.clearance_remark_id IS NOT NULL)`;

const FILE_JOINS = sql`
  FROM imports_t i
  JOIN license_t l ON l.id = i.license_id
  LEFT JOIN client_master_t c ON c.id = l.client_id
  LEFT JOIN import_apurement_t a ON a.import_id = i.id
  LEFT JOIN apurement_option_master_t ot ON ot.id = a.clearance_type_id
  LEFT JOIN apurement_option_master_t orm ON orm.id = a.clearance_remark_id`;

const byClient = (clientId: number | undefined): SQL => (clientId ? sql` AND l.client_id = ${clientId}` : sql``);

const date = (col: SQL): SQL => sql`to_char(${col}, 'YYYY-MM-DD')`;
const money = (col: SQL): SQL => sql`COALESCE(${col}, 0)::float`;
const CIF = sql`(COALESCE(i.fob, 0) + COALESCE(i.fret, 0) + COALESCE(i.insurance_amount, 0) + COALESCE(i.other_charges, 0))::float`;

/** Every column a file shows, on the grid, the detail view and the exports alike. */
const FILE_COLUMNS = sql`
  i.id AS import_id,
  c.short_name AS client_short,
  c.company_name AS client_company,
  l.id AS license_id,
  l.license_number,
  ${date(sql`l.license_applied_date`)} AS date_val,
  ${date(sql`l.license_expiry_date`)} AS date_ech,
  (COALESCE(l.fob_declared, 0) + COALESCE(l.freight, 0) + COALESCE(l.insurance, 0) + COALESCE(l.other_costs, 0))::float AS cif_lic,
  i.mca_ref,
  ${money(sql`i.fob`)} AS fob,
  ${money(sql`i.fret`)} AS fret,
  ${money(sql`i.insurance_amount`)} AS assurance,
  ${money(sql`i.other_charges`)} AS autres_frets,
  ${CIF} AS cif,
  i.declaration_reference AS ref_decl,
  ${date(sql`i.dgda_in_date`)} AS date_decl,
  i.liquidation_reference AS ref_liquid,
  ${date(sql`i.liquidation_date`)} AS date_liquid,
  i.quittance_reference AS ref_quit,
  ${date(sql`i.quittance_date`)} AS date_quit,
  (SELECT cur.currency_short_name FROM currency_master_t cur WHERE cur.id = i.currency) AS monnaie,
  (SELECT p.partial_name FROM partial_t p WHERE p.partial_name = i.inspection_reports AND p.display = 'Y' LIMIT 1) AS num_av,
  COALESCE((SELECT p.partial_fob FROM partial_t p WHERE p.partial_name = i.inspection_reports AND p.display = 'Y' LIMIT 1), 0)::float AS montant_av,
  i.invoice AS facture,
  NULLIF(concat_ws(', ', NULLIF(btrim(i.road_manif), ''), NULLIF(btrim(i.airway_bill), '')), '') AS bl_lta,
  a.ass_ref AS saved_ass_ref,
  NULLIF(btrim(i.insurance_reference), '') AS auto_ass_ref,
  a.clearance_type_id,
  ot.option_name AS clearance_type,
  ot.requires_remark AS type_requires_remark,
  a.clearance_remark_id,
  orm.option_name AS clearance_remark,
  a.transmission_id`;

export interface ApurementFileRow {
  import_id: number;
  client_short: string | null;
  client_company: string | null;
  license_id: number;
  license_number: string | null;
  date_val: string | null;
  date_ech: string | null;
  cif_lic: number;
  mca_ref: string | null;
  fob: number;
  fret: number;
  assurance: number;
  autres_frets: number;
  cif: number;
  ref_decl: string | null;
  date_decl: string | null;
  ref_liquid: string | null;
  date_liquid: string | null;
  ref_quit: string | null;
  date_quit: string | null;
  monnaie: string | null;
  num_av: string | null;
  montant_av: number;
  facture: string | null;
  bl_lta: string | null;
  /** What has been saved — null until an operator (or Auto ASS REF) records one. */
  saved_ass_ref: string | null;
  /** The file's Insurance Reference — what the grid offers while nothing is saved. */
  auto_ass_ref: string | null;
  clearance_type_id: number | null;
  clearance_type: string | null;
  type_requires_remark: boolean | null;
  clearance_remark_id: number | null;
  clearance_remark: string | null;
  transmission_id: number | null;
}

// ---- Dashboard --------------------------------------------------------------------

export interface ApurementStats {
  pending_files: number;
  apured_files: number;
  transmissions_with_ar: number;
  transmissions_without_ar: number;
}

export async function apurementStats(clientId?: number): Promise<ApurementStats> {
  const [files] = await rows<{ pending: number; apured: number }>(db, sql`
    SELECT COUNT(*) FILTER (WHERE ${PENDING})::int AS pending,
           COUNT(*) FILTER (WHERE a.transmission_id IS NOT NULL)::int AS apured
    ${FILE_JOINS}
    WHERE ${ELIGIBLE}${byClient(clientId)}`);
  const [tx] = await rows<{ with_ar: number; without_ar: number }>(db, sql`
    SELECT COUNT(*) FILTER (WHERE t.ar_file_id IS NOT NULL)::int AS with_ar,
           COUNT(*) FILTER (WHERE t.ar_file_id IS NULL)::int AS without_ar
    FROM import_transmission_t t
    WHERE t.display = 'Y'${clientId ? sql` AND t.client_id = ${clientId}` : sql``}`);
  return {
    pending_files: files?.pending ?? 0,
    apured_files: files?.apured ?? 0,
    transmissions_with_ar: tx?.with_ar ?? 0,
    transmissions_without_ar: tx?.without_ar ?? 0,
  };
}

export interface ApurementClient {
  id: number;
  short_name: string | null;
  company_name: string | null;
  file_count: number;
}

/**
 * Clients with files in a given state — `pending` for the pending-grid picker,
 * `ready` for a new transmission (only a client with something to send).
 */
export async function apurementClients(state: 'pending' | 'ready'): Promise<ApurementClient[]> {
  return rows<ApurementClient>(db, sql`
    SELECT c.id, c.short_name, c.company_name, COUNT(*)::int AS file_count
    ${FILE_JOINS}
    WHERE ${ELIGIBLE} AND c.id IS NOT NULL AND ${state === 'ready' ? READY : PENDING}
    GROUP BY c.id, c.short_name, c.company_name
    ORDER BY c.id`);
}

// ---- Pending grid -----------------------------------------------------------------

export async function listPendingFiles(clientId?: number): Promise<ApurementFileRow[]> {
  return rows<ApurementFileRow>(db, sql`
    SELECT ${FILE_COLUMNS}
    ${FILE_JOINS}
    WHERE ${ELIGIBLE} AND ${PENDING}${byClient(clientId)}
    ORDER BY i.quittance_date DESC, l.license_number, i.id`);
}

interface OptionRow {
  id: number;
  option_group: 'type' | 'remark';
  option_name: string;
  requires_remark: boolean;
}

async function loadOptions(exec: Executor, ids: number[]): Promise<Map<number, OptionRow>> {
  if (ids.length === 0) return new Map();
  const list = await rows<OptionRow>(exec, sql`
    SELECT id, option_group, option_name, requires_remark
    FROM apurement_option_master_t
    WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(list.map((o) => [o.id, o]));
}

/**
 * The pending grid's one Save (§4.17): every edited row, all or nothing.
 *
 * Each row is merged onto what is stored, then judged as a whole — a row that
 * would end with a Type requiring a Remarque and no Remarque is refused with its
 * file named, rather than saved incomplete. A Type that does not require a
 * Remarque clears it, server-side, whatever the request said.
 */
export async function saveApurementRows(rowsIn: ApurementRowInput[], uid: number): Promise<{ saved: number }> {
  const importIds = [...new Set(rowsIn.map((r) => r.import_id))];
  if (importIds.length !== rowsIn.length) {
    throw new BadRequestError('The same file appears twice in one save — reload the grid and save again.');
  }

  return db.transaction(async (tx) => {
    const current = await rows<{
      import_id: number;
      mca_ref: string | null;
      apurement_id: number | null;
      ass_ref: string | null;
      clearance_type_id: number | null;
      clearance_remark_id: number | null;
      transmission_id: number | null;
      eligible: boolean;
    }>(tx, sql`
      SELECT i.id AS import_id, i.mca_ref, a.id AS apurement_id, a.ass_ref,
             a.clearance_type_id, a.clearance_remark_id, a.transmission_id,
             (${ELIGIBLE}) AS eligible
      FROM imports_t i
      JOIN license_t l ON l.id = i.license_id
      LEFT JOIN import_apurement_t a ON a.import_id = i.id
      WHERE i.id IN (${sql.join(importIds.map((id) => sql`${id}`), sql`, `)})
      FOR UPDATE OF i`);
    const byId = new Map(current.map((r) => [r.import_id, r]));

    const optionIds = rowsIn
      .flatMap((r) => [r.clearance_type_id, r.clearance_remark_id])
      .filter((v): v is number => typeof v === 'number');
    const stored = current.flatMap((r) => [r.clearance_type_id, r.clearance_remark_id]).filter((v): v is number => v != null);
    const options = await loadOptions(tx, [...new Set([...optionIds, ...stored])]);

    const problems: string[] = [];
    const plans: Array<{ input: ApurementRowInput; before: (typeof current)[number]; after: { ass_ref: string | null; clearance_type_id: number | null; clearance_remark_id: number | null } }> = [];

    for (const input of rowsIn) {
      const before = byId.get(input.import_id);
      if (!before) {
        problems.push(`File #${input.import_id} no longer exists.`);
        continue;
      }
      const name = before.mca_ref || `#${input.import_id}`;
      if (before.transmission_id) {
        problems.push(`${name} is already in a transmission and can no longer be changed — delete the transmission first.`);
        continue;
      }
      if (!before.eligible) {
        problems.push(`${name} is no longer awaiting apurement (cancelled, deleted, or its quittance date was removed).`);
        continue;
      }

      const typeId = input.clearance_type_id !== undefined ? input.clearance_type_id : before.clearance_type_id;
      let remarkId = input.clearance_remark_id !== undefined ? input.clearance_remark_id : before.clearance_remark_id;
      const type = typeId != null ? options.get(typeId) : undefined;
      const remark = remarkId != null ? options.get(remarkId) : undefined;

      if (typeId != null && type?.option_group !== 'type') {
        problems.push(`${name}: the chosen Type does not exist — reload the grid and pick it again.`);
        continue;
      }
      if (remarkId != null && remark?.option_group !== 'remark') {
        problems.push(`${name}: the chosen Remarque does not exist — reload the grid and pick it again.`);
        continue;
      }
      if (type && !type.requires_remark) remarkId = null;
      if (type?.requires_remark && remarkId == null) {
        problems.push(`${name}: Type "${type.option_name}" needs a Remarque.`);
        continue;
      }

      plans.push({
        input,
        before,
        after: {
          ass_ref: input.ass_ref !== undefined ? input.ass_ref : before.ass_ref,
          clearance_type_id: typeId,
          clearance_remark_id: remarkId,
        },
      });
    }

    if (problems.length > 0) {
      const head = problems.length === 1 ? problems[0]! : `${problems.length} rows were not saved: ${problems.slice(0, 5).join(' ')}`;
      throw new BadRequestError(
        problems.length > 5 ? `${head} …and ${problems.length - 5} more. Nothing was saved.` : `${head}${problems.length > 1 ? ' Nothing was saved.' : ''}`,
      );
    }

    for (const p of plans) {
      await tx.execute(sql`
        INSERT INTO import_apurement_t (import_id, ass_ref, clearance_type_id, clearance_remark_id, created_by, updated_by)
        VALUES (${p.input.import_id}, ${p.after.ass_ref}, ${p.after.clearance_type_id}, ${p.after.clearance_remark_id}, ${uid}, ${uid})
        ON CONFLICT (import_id) DO UPDATE
          SET ass_ref = EXCLUDED.ass_ref,
              clearance_type_id = EXCLUDED.clearance_type_id,
              clearance_remark_id = EXCLUDED.clearance_remark_id,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()`);
      await recordAudit(tx, {
        actorId: uid,
        action: p.before.apurement_id ? 'update' : 'create',
        entityType: 'import_apurement',
        entityId: p.input.import_id,
        module: 'import-apurement',
        before: p.before.apurement_id
          ? { ass_ref: p.before.ass_ref, clearance_type_id: p.before.clearance_type_id, clearance_remark_id: p.before.clearance_remark_id }
          : undefined,
        after: p.after,
        metadata: { mca_ref: p.before.mca_ref },
      });
    }
    return { saved: plans.length };
  });
}

/**
 * Copies each pending file's Insurance Reference into its ASS REF where none is
 * saved yet — the legacy "Auto ASS REF". Never overwrites a saved one.
 */
export async function autoFillAssRef(clientId: number, uid: number): Promise<{ filled: number }> {
  return db.transaction(async (tx) => {
    const targets = await rows<{ import_id: number; ref: string }>(tx, sql`
      SELECT i.id AS import_id, btrim(i.insurance_reference) AS ref
      ${FILE_JOINS}
      WHERE ${ELIGIBLE} AND ${PENDING}${byClient(clientId)}
        AND NULLIF(btrim(i.insurance_reference), '') IS NOT NULL
        AND NULLIF(btrim(a.ass_ref), '') IS NULL`);
    if (targets.length === 0) return { filled: 0 };

    for (const t of targets) {
      await tx.execute(sql`
        INSERT INTO import_apurement_t (import_id, ass_ref, created_by, updated_by)
        VALUES (${t.import_id}, ${t.ref}, ${uid}, ${uid})
        ON CONFLICT (import_id) DO UPDATE
          SET ass_ref = EXCLUDED.ass_ref, updated_by = EXCLUDED.updated_by, updated_at = now()
          WHERE import_apurement_t.transmission_id IS NULL
            AND NULLIF(btrim(import_apurement_t.ass_ref), '') IS NULL`);
    }
    await recordAudit(tx, {
      actorId: uid,
      action: 'update',
      entityType: 'import_apurement',
      entityId: `client:${clientId}`,
      module: 'import-apurement',
      after: { auto_ass_ref: targets.length },
      metadata: { import_ids: targets.map((t) => t.import_id) },
    });
    return { filled: targets.length };
  });
}

// ---- New transmission -------------------------------------------------------------

export interface ReadyLicence {
  id: number;
  license_number: string | null;
  file_count: number;
}

export async function readyLicences(clientId: number): Promise<ReadyLicence[]> {
  return rows<ReadyLicence>(db, sql`
    SELECT l.id, l.license_number, COUNT(*)::int AS file_count
    ${FILE_JOINS}
    WHERE ${ELIGIBLE} AND ${READY} AND l.client_id = ${clientId}
    GROUP BY l.id, l.license_number
    ORDER BY l.id`);
}

export interface LicenceApurementSummary {
  license_number: string | null;
  client_id: number | null;
  currency: string | null;
  date_val: string | null;
  date_ech: string | null;
  total_files: number;
  license: { weight: number; fob: number; fret: number; assurance: number; autres: number; cif: number };
  used: { weight: number; fob: number; fret: number; assurance: number; autres: number; cif: number };
  remaining: { weight: number; fob: number; fret: number; assurance: number; autres: number; cif: number };
}

/** What the licence allowed, what its live import files used, and what is left. */
export async function licenceApurementSummary(licenseId: number): Promise<LicenceApurementSummary | null> {
  const [r] = await rows<Row>(db, sql`
    SELECT l.license_number, l.client_id,
           (SELECT cur.currency_short_name FROM currency_master_t cur WHERE cur.id = l.currency_id) AS currency,
           ${date(sql`l.license_applied_date`)} AS date_val,
           ${date(sql`l.license_expiry_date`)} AS date_ech,
           ${money(sql`l.weight`)} AS l_weight, ${money(sql`l.fob_declared`)} AS l_fob,
           ${money(sql`l.freight`)} AS l_fret, ${money(sql`l.insurance`)} AS l_assurance,
           ${money(sql`l.other_costs`)} AS l_autres,
           COALESCE(u.files, 0)::int AS total_files,
           COALESCE(u.weight, 0)::float AS u_weight, COALESCE(u.fob, 0)::float AS u_fob,
           COALESCE(u.fret, 0)::float AS u_fret, COALESCE(u.assurance, 0)::float AS u_assurance,
           COALESCE(u.autres, 0)::float AS u_autres
    FROM license_t l
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS files, SUM(i.weight) AS weight, SUM(i.fob) AS fob, SUM(i.fret) AS fret,
             SUM(i.insurance_amount) AS assurance, SUM(i.other_charges) AS autres
      FROM imports_t i
      WHERE i.license_id = l.id AND i.display = 'Y' AND ${fileNotCancelled(sql`i.clearing_status`)}
    ) u ON true
    WHERE l.id = ${licenseId} AND l.display = 'Y'`);
  if (!r) return null;
  const n = (k: string): number => Number(r[k] ?? 0);
  const lic = { weight: n('l_weight'), fob: n('l_fob'), fret: n('l_fret'), assurance: n('l_assurance'), autres: n('l_autres'), cif: 0 };
  lic.cif = lic.fob + lic.fret + lic.assurance + lic.autres;
  const used = { weight: n('u_weight'), fob: n('u_fob'), fret: n('u_fret'), assurance: n('u_assurance'), autres: n('u_autres'), cif: 0 };
  used.cif = used.fob + used.fret + used.assurance + used.autres;
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    license_number: (r.license_number as string | null) ?? null,
    client_id: (r.client_id as number | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    date_val: (r.date_val as string | null) ?? null,
    date_ech: (r.date_ech as string | null) ?? null,
    total_files: n('total_files'),
    license: lic,
    used,
    remaining: {
      weight: round(lic.weight - used.weight),
      fob: round(lic.fob - used.fob),
      fret: round(lic.fret - used.fret),
      assurance: round(lic.assurance - used.assurance),
      autres: round(lic.autres - used.autres),
      cif: round(lic.cif - used.cif),
    },
  };
}

export async function readyFiles(licenseId: number): Promise<ApurementFileRow[]> {
  return rows<ApurementFileRow>(db, sql`
    SELECT ${FILE_COLUMNS}
    ${FILE_JOINS}
    WHERE ${ELIGIBLE} AND ${READY} AND l.id = ${licenseId}
    ORDER BY i.quittance_date DESC, i.id`);
}

/**
 * One transmission: every ready file of the licence, sent together, under a
 * reference the generator issues inside this transaction (§4.33). The files are
 * locked first so a concurrent create cannot put the same file in two.
 */
export async function createTransmission(
  input: TransmissionCreateInput,
  uid: number,
): Promise<{ id: number; reference: string; files: number }> {
  return db.transaction(async (tx) => {
    const [licence] = await rows<{ client_id: number | null; license_number: string | null; import_kind: boolean }>(tx, sql`
      SELECT l.client_id, l.license_number,
             l.kind_id IN (SELECT k.id FROM kind_master_t k WHERE k.use_for_import) AS import_kind
      FROM license_t l WHERE l.id = ${input.license_id} AND l.display = 'Y'`);
    if (!licence) throw new NotFoundError(`Licence #${input.license_id} was not found or has been deleted.`);
    if (licence.client_id !== input.client_id) {
      throw new BadRequestError(`Licence ${licence.license_number ?? input.license_id} does not belong to the chosen client — pick the licence again.`);
    }
    if (!licence.import_kind) {
      throw new BadRequestError(`Licence ${licence.license_number ?? input.license_id} is not an import licence, so it is not apured here.`);
    }

    // Inner joins on purpose: a ready file always has an apurement row, and
    // Postgres refuses FOR UPDATE on the nullable side of an outer join.
    const ready = await rows<{ apurement_id: number; mca_ref: string | null }>(tx, sql`
      SELECT a.id AS apurement_id, i.mca_ref
      FROM imports_t i
      JOIN license_t l ON l.id = i.license_id
      JOIN import_apurement_t a ON a.import_id = i.id
      JOIN apurement_option_master_t ot ON ot.id = a.clearance_type_id
      WHERE ${ELIGIBLE} AND ${READY} AND l.id = ${input.license_id}
      FOR UPDATE OF a`);
    if (ready.length === 0) {
      throw new ConflictError(
        `No file on licence ${licence.license_number ?? input.license_id} is ready to transmit. ` +
          'A file needs an ASS REF and a Type (and a Remarque where the Type requires one) — complete them on the pending grid.',
      );
    }

    const [issued] = await generateReferences('import-apurement', { client_id: input.client_id }, 1, tx);
    if (!issued) {
      throw new BadRequestError(
        'The transmission reference could not be generated — the client has no short code, which the format needs. ' +
          'Set it on the client, or change the format under Developer Options → Reference Formats.',
      );
    }

    const [created] = await rows<{ id: number }>(tx, sql`
      INSERT INTO import_transmission_t
        (client_id, license_id, bank_id, transmission_reference, transmission_date, date_depot, created_by, updated_by)
      VALUES (${input.client_id}, ${input.license_id}, ${input.bank_id}, ${issued.ref},
              ${input.transmission_date}, ${input.date_depot}, ${uid}, ${uid})
      RETURNING id`);
    const transmissionId = created!.id;

    await tx.execute(sql`
      UPDATE import_apurement_t
         SET transmission_id = ${transmissionId}, updated_by = ${uid}, updated_at = now()
       WHERE id IN (${sql.join(ready.map((r) => sql`${r.apurement_id}`), sql`, `)})`);

    await recordAudit(tx, {
      actorId: uid,
      action: 'create',
      entityType: 'import_transmission',
      entityId: transmissionId,
      module: 'import-apurement',
      after: { ...input, transmission_reference: issued.ref, files: ready.map((r) => r.mca_ref) },
    });
    return { id: transmissionId, reference: issued.ref, files: ready.length };
  });
}

// ---- Transmissions ----------------------------------------------------------------

export interface TransmissionRow {
  id: number;
  client_id: number;
  client_short: string | null;
  client_company: string | null;
  transmission_reference: string;
  transmission_date: string;
  date_depot: string;
  bank_id: number;
  bank_name: string | null;
  license_id: number;
  license_number: string | null;
  file_count: number;
  ar_file_id: number | null;
  ar_file_name: string | null;
}

const TRANSMISSION_SELECT = sql`
  SELECT t.id, t.client_id, c.short_name AS client_short, c.company_name AS client_company,
         t.transmission_reference,
         ${date(sql`t.transmission_date`)} AS transmission_date,
         ${date(sql`t.date_depot`)} AS date_depot,
         t.bank_id, b.bank_name, t.license_id, l.license_number,
         (SELECT COUNT(*) FROM import_apurement_t a WHERE a.transmission_id = t.id)::int AS file_count,
         t.ar_file_id,
         (SELECT f.original_name FROM files_t f WHERE f.id = t.ar_file_id AND f.status <> 'deleted') AS ar_file_name
  FROM import_transmission_t t
  LEFT JOIN client_master_t c ON c.id = t.client_id
  LEFT JOIN license_t l ON l.id = t.license_id
  LEFT JOIN banklist_master_t b ON b.id = t.bank_id`;

function transmissionWhere(q: Pick<TransmissionListQuery, 'client_id' | 'ar' | 'q'>): SQL {
  const conds: SQL[] = [sql`t.display = 'Y'`];
  if (q.client_id) conds.push(sql`t.client_id = ${q.client_id}`);
  if (q.ar === 'with') conds.push(sql`t.ar_file_id IS NOT NULL`);
  if (q.ar === 'without') conds.push(sql`t.ar_file_id IS NULL`);
  const term = q.q?.trim();
  if (term) {
    const like = `%${term}%`;
    // §4.15 / §4.19 — what the grid shows, searchable as shown: the client code
    // and its legal name, and the dates in their DD-MM-YYYY form.
    conds.push(sql`(
      t.transmission_reference ILIKE ${like} OR c.short_name ILIKE ${like} OR c.company_name ILIKE ${like}
      OR l.license_number ILIKE ${like} OR b.bank_name ILIKE ${like}
      OR to_char(t.transmission_date, 'DD-MM-YYYY') ILIKE ${like} OR to_char(t.date_depot, 'DD-MM-YYYY') ILIKE ${like}
    )`);
  }
  return sql.join(conds, sql` AND `);
}

export async function listTransmissions(
  q: Pick<TransmissionListQuery, 'client_id' | 'ar' | 'q'>,
  page?: { limit: number; offset: number },
): Promise<{ items: TransmissionRow[]; total: number }> {
  const where = transmissionWhere(q);
  const [count] = await rows<{ total: number }>(db, sql`
    SELECT COUNT(*)::int AS total
    FROM import_transmission_t t
    LEFT JOIN client_master_t c ON c.id = t.client_id
    LEFT JOIN license_t l ON l.id = t.license_id
    LEFT JOIN banklist_master_t b ON b.id = t.bank_id
    WHERE ${where}`);
  const items = await rows<TransmissionRow>(db, sql`
    ${TRANSMISSION_SELECT}
    WHERE ${where}
    ORDER BY t.transmission_date DESC, t.id DESC
    ${page ? sql`LIMIT ${page.limit} OFFSET ${page.offset}` : sql``}`);
  return { items, total: count?.total ?? 0 };
}

export async function getTransmission(id: number): Promise<TransmissionRow | null> {
  const [row] = await rows<TransmissionRow>(db, sql`${TRANSMISSION_SELECT} WHERE t.id = ${id} AND t.display = 'Y'`);
  return row ?? null;
}

/** The files a set of transmissions carried, for the detail view and the exports. */
export async function transmissionFiles(transmissionIds: number[]): Promise<ApurementFileRow[]> {
  if (transmissionIds.length === 0) return [];
  return rows<ApurementFileRow>(db, sql`
    SELECT ${FILE_COLUMNS}
    ${FILE_JOINS}
    WHERE a.transmission_id IN (${sql.join(transmissionIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY a.transmission_id, i.mca_ref`);
}

/**
 * §4.27 — the transmission is hidden, and its files go back to pending so they
 * can be sent again. Its reference stays spent (the generator counts deleted rows).
 */
export async function deleteTransmission(id: number, uid: number): Promise<TransmissionRow> {
  const before = await getTransmission(id);
  if (!before) throw new NotFoundError(`Transmission #${id} was not found. It may already have been deleted — reload the list.`);
  await db.transaction(async (tx) => {
    const released = await rows<{ import_id: number }>(tx, sql`
      UPDATE import_apurement_t SET transmission_id = NULL, updated_by = ${uid}, updated_at = now()
       WHERE transmission_id = ${id}
       RETURNING import_id`);
    await tx.execute(sql`
      UPDATE import_transmission_t SET display = 'N', updated_by = ${uid}, updated_at = now() WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId: uid,
      action: 'delete',
      entityType: 'import_transmission',
      entityId: id,
      module: 'import-apurement',
      before,
      metadata: { files_returned_to_pending: released.map((r) => r.import_id) },
    });
  });
  return before;
}

/** Attach (or, with null, detach) the bank's acknowledgement of receipt. */
export async function setTransmissionAr(id: number, fileId: number | null, uid: number): Promise<void> {
  const before = await getTransmission(id);
  if (!before) throw new NotFoundError(`Transmission #${id} was not found. It may have been deleted — reload the list.`);
  if (fileId !== null) {
    const [file] = await rows<{ id: number }>(db, sql`SELECT id FROM files_t WHERE id = ${fileId} AND status <> 'deleted'`);
    if (!file) throw new BadRequestError('The uploaded acknowledgement could not be found — upload it again.');
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE import_transmission_t SET ar_file_id = ${fileId}, updated_by = ${uid}, updated_at = now() WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId: uid,
      action: 'update',
      entityType: 'import_transmission',
      entityId: id,
      module: 'import-apurement',
      before: { ar_file_id: before.ar_file_id },
      after: { ar_file_id: fileId },
    });
  });
}

// ---- Apured files -----------------------------------------------------------------

export interface ApuredFileRow extends ApurementFileRow {
  transmission_reference: string;
  transmission_date: string;
  bank_name: string | null;
}

export async function listApuredFiles(q: ApuredListQuery): Promise<ApuredFileRow[]> {
  const term = q.q?.trim();
  const like = term ? `%${term}%` : null;
  return rows<ApuredFileRow>(db, sql`
    SELECT ${FILE_COLUMNS},
           t.transmission_reference, ${date(sql`t.transmission_date`)} AS transmission_date, b.bank_name
    ${FILE_JOINS}
    JOIN import_transmission_t t ON t.id = a.transmission_id AND t.display = 'Y'
    LEFT JOIN banklist_master_t b ON b.id = t.bank_id
    WHERE ${ELIGIBLE}${byClient(q.client_id)}
    ${like ? sql`AND (i.mca_ref ILIKE ${like} OR l.license_number ILIKE ${like} OR c.short_name ILIKE ${like}
                    OR c.company_name ILIKE ${like} OR t.transmission_reference ILIKE ${like}
                    OR i.declaration_reference ILIKE ${like})` : sql``}
    ORDER BY t.transmission_date DESC, i.mca_ref`);
}
