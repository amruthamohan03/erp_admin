// §2 step 3 — cancelling a tracking file (Import, Export or Local).
//
// A cancelled file is a clearing STATUS, not a deletion: the row keeps its
// reference, its history and its place in reports (§4.27). Cancelling sets
// `clearing_status` to the CANCELLED row of clearing_status_master_t, records
// the reason (cancellation_reason_master_t) and the date, and writes both into
// the file's remarks so the tracking screens show why it stopped.
//
// Three consequences, each enforced from ONE fragment here rather than
// restated at every call site (§4.10):
//
//   * no further activity — the invoice and payment request pickers, and their
//     save-time checks, refuse a cancelled file (`fileNotCancelled`);
//   * the licence gets its weight / FOB back — every sum that measures what a
//     licence or a PARTIELLE allotment has used skips a cancelled file;
//   * a file already on a live INVOICE is not cancelled: the request is refused
//     with the invoice named (§4.37). A PAYMENT REQUEST does not block it — the
//     requests are shown with their status and amount, the operator confirms,
//     and anything already paid becomes a recollection to recover
//     (payment_recollection_t), recorded from the Cancelled Files list.
//
// The CANCELLED row is found by its name, not by id 7 — ids differ between
// databases, and the name is what the master screen shows.
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { formatDate } from '@/lib/formatDate';
import { recordAudit } from '@/lib/audit/recordAudit';
import { raiseEvent } from './notifications';
import { loadPaymentStages } from './paymentStages';
import { paymentStatus, type PaymentApprovalState } from '@/lib/payments/stages';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

export { FILE_KINDS, type FileKind } from '@/schemas/fileCancellation';
import type { FileKind } from '@/schemas/fileCancellation';

/** The value a licence picker uses for files that carry no licence. */
export const NO_LICENSE = 0;

interface FileSource {
  table: 'imports_t' | 'exports_t' | 'locals_t';
  refCol: 'mca_ref' | 'mca_lt_reference';
  /** Import and export files draw on a licence; local files have none. */
  licensed: boolean;
  /** Import / export keep a dated remarks log (JSONB); local keeps free text. */
  remarkLog: boolean;
  /** Payment Request's `pay_for` code for this kind of file. */
  payFor: number;
  /** The transaction page, for the audit entry's module. */
  page: string;
  label: string;
}

const SOURCES: Record<FileKind, FileSource> = {
  import: { table: 'imports_t', refCol: 'mca_ref', licensed: true, remarkLog: true, payFor: 0, page: 'import', label: 'Import' },
  export: { table: 'exports_t', refCol: 'mca_ref', licensed: true, remarkLog: true, payFor: 1, page: 'export', label: 'Export' },
  local: { table: 'locals_t', refCol: 'mca_lt_reference', licensed: false, remarkLog: false, payFor: 2, page: 'local', label: 'Local' },
};

export const fileSource = (kind: FileKind): FileSource => SOURCES[kind];

/**
 * TRUE when the file whose `clearing_status` is `statusCol` is not cancelled.
 * Pass a QUALIFIED column (`sql\`i.clearing_status\``, a Drizzle column): inside
 * the subquery an unqualified `clearing_status` would name the master's own
 * text column, and the test would silently always pass.
 */
export function fileNotCancelled(statusCol: SQL | AnyColumn): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM clearing_status_master_t cs_x
    WHERE cs_x.id = ${statusCol} AND upper(trim(cs_x.clearing_status)) = 'CANCELLED')`;
}

async function cancelledStatusId(tx: Transaction): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT id FROM clearing_status_master_t
    WHERE upper(trim(clearing_status)) = 'CANCELLED' AND display = 'Y'
    ORDER BY id LIMIT 1`);
  const id = (rows as unknown as { rows: { id: number }[] }).rows[0]?.id;
  if (!id) {
    throw new ValidationError(
      'There is no CANCELLED clearing status — add it under Masters → Clearing Status, then cancel the file.',
    );
  }
  return id;
}

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Rows<T> = { rows: T[] };

// ---------------------------------------------------------------------------
// PICKERS
// ---------------------------------------------------------------------------

export interface CancellableLicense {
  id: number;
  license_number: string;
  files: number;
}

/** The client's licences that still carry a live, uncancelled file of `kind`. */
export async function cancellableLicenses(kind: FileKind, clientId: number): Promise<CancellableLicense[]> {
  const src = SOURCES[kind];
  if (!src.licensed) return [];
  const t = sql.identifier(src.table);
  const rows = await db.execute(sql`
    SELECT COALESCE(f.license_id, ${NO_LICENSE}) AS id,
           COALESCE(max(l.license_number), 'No licence recorded') AS license_number,
           count(*)::int AS files
    FROM ${t} f
    LEFT JOIN license_t l ON l.id = f.license_id
    WHERE f.client_id = ${clientId} AND f.display = 'Y'
      AND f.${sql.identifier(src.refCol)} IS NOT NULL AND f.${sql.identifier(src.refCol)} <> ''
      AND ${fileNotCancelled(sql`f.clearing_status`)}
    GROUP BY 1
    ORDER BY 1`);
  return (rows as unknown as Rows<CancellableLicense>).rows;
}

export interface CancellableFile {
  id: number;
  mca_ref: string;
  license_id: number | null;
  /** "FOB $78,350.54 · 12,373.80 kg · IN PROGRESS" — the picker's second line. */
  detail: string;
}

/**
 * Live, uncancelled files of the client — on the given licences for a licensed
 * kind (`NO_LICENSE` selects the files that carry none).
 */
export async function cancellableFiles(
  kind: FileKind,
  clientId: number,
  licenseIds: number[],
): Promise<CancellableFile[]> {
  const src = SOURCES[kind];
  if (src.licensed && licenseIds.length === 0) return [];
  const ref = sql.identifier(src.refCol);
  const licenseFilter = src.licensed
    ? sql`AND COALESCE(f.license_id, ${NO_LICENSE}) IN (${sql.join(licenseIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  // Locals carry weight but no FOB.
  const fob = kind === 'local' ? sql`NULL::numeric` : sql`f.fob`;
  const rows = await db.execute(sql`
    SELECT f.id, f.${ref} AS mca_ref, ${src.licensed ? sql`f.license_id` : sql`NULL::int`} AS license_id,
           ${fob} AS fob, f.weight, cs.clearing_status AS status
    FROM ${sql.identifier(src.table)} f
    LEFT JOIN clearing_status_master_t cs ON cs.id = f.clearing_status
    WHERE f.client_id = ${clientId} AND f.display = 'Y'
      AND f.${ref} IS NOT NULL AND f.${ref} <> ''
      AND ${fileNotCancelled(sql`f.clearing_status`)}
      ${licenseFilter}
    ORDER BY f.id
    LIMIT 1000`);
  type Row = { id: number; mca_ref: string; license_id: number | null; fob: unknown; weight: unknown; status: string | null };
  return (rows as unknown as Rows<Row>).rows.map((r) => ({
    id: r.id,
    mca_ref: r.mca_ref,
    license_id: r.license_id,
    detail: [
      N(r.fob) > 0 ? `FOB $${fmt(N(r.fob))}` : '',
      N(r.weight) > 0 ? `${fmt(N(r.weight))} kg` : '',
      r.status ?? '',
    ].filter(Boolean).join(' · '),
  }));
}

// ---------------------------------------------------------------------------
// WHO STILL HOLDS A FILE
// ---------------------------------------------------------------------------

export interface FileHolder {
  mca_ref: string;
  /** "Import invoice 2026-NMI-0004", "Fiche de Calcul FICHE-…". */
  held_by: string;
}

/** A payment request raised against a file, as the confirmation and the list show it. */
export interface FilePayment {
  payment_id: number;
  mca_ref: string;
  file_id: number;
  requestee: string | null;
  beneficiary: string | null;
  amount: number;
  currency_id: number | null;
  currency: string | null;
  status_key: string;
  status_label: string;
  paid: boolean;
  created_at: string | null;
  /** Set once a cancellation opened a recollection for it. */
  recollection_id: number | null;
  /** 'pending' | 'recovered' | 'written_off'. */
  recollection_status: string | null;
  recovered_amount: number | null;
  recovered_date: string | null;
}

/** Live invoices and payment requests that name any of these files. */
async function fileHolders(tx: Transaction, kind: FileKind, files: { id: number; mca_ref: string }[]): Promise<FileHolder[]> {
  if (files.length === 0) return [];
  const src = SOURCES[kind];
  const ids = sql.join(files.map((f) => sql`${f.id}`), sql`, `);
  const refs = sql.join(files.map((f) => sql`${f.mca_ref.toUpperCase()}`), sql`, `);
  const refOf = new Map(files.map((f) => [f.id, f.mca_ref]));
  const out: FileHolder[] = [];

  if (kind === 'import') {
    // mca_ids is a CSV — split and compared by whole entry (§4.37).
    const rows = await tx.execute(sql`
      SELECT f.id AS mca_id, inv.invoice_ref, inv.id
      FROM import_invoices_t inv
      JOIN imports_t f
        ON f.id::text = ANY (string_to_array(replace(COALESCE(inv.mca_ids, ''), ' ', ''), ','))
      WHERE inv.display = 'Y' AND f.id IN (${ids})`);
    for (const r of (rows as unknown as Rows<{ mca_id: number; invoice_ref: string | null; id: number }>).rows) {
      out.push({ mca_ref: refOf.get(r.mca_id) ?? String(r.mca_id), held_by: `Import invoice ${r.invoice_ref ?? `#${r.id}`}` });
    }
    // A Fiche de Calcul is raised on one import file.
    const fiches = await tx.execute(sql`
      SELECT import_id AS mca_id, fiche_reference, id
      FROM fiche_de_calcul_t
      WHERE display = 'Y' AND import_id IN (${ids})`);
    for (const r of (fiches as unknown as Rows<{ mca_id: number; fiche_reference: string | null; id: number }>).rows) {
      out.push({ mca_ref: refOf.get(r.mca_id) ?? String(r.mca_id), held_by: `Fiche de Calcul ${r.fiche_reference ?? `#${r.id}`}` });
    }
  } else if (kind === 'export') {
    const rows = await tx.execute(sql`
      SELECT DISTINCT d.mca_id, x.invoice_ref, x.id
      FROM export_invoice_mca_details_t d
      JOIN export_invoices_t x ON x.id = d.export_invoice_id AND x.display = 'Y'
      WHERE d.mca_id IN (${ids})`);
    for (const r of (rows as unknown as Rows<{ mca_id: number; invoice_ref: string | null; id: number }>).rows) {
      out.push({ mca_ref: refOf.get(r.mca_id) ?? String(r.mca_id), held_by: `Export invoice ${r.invoice_ref ?? `#${r.id}`}` });
    }
  }

  return out;
}

/**
 * The live payment requests raised against these files, with what each is worth
 * and where it has got to.
 *
 * Unlike an invoice, a payment request does NOT block a cancellation: the work
 * was done and the money may already have gone out, which is precisely what the
 * operator needs to see before confirming. So it is reported, confirmed, and an
 * amount already paid becomes an open recollection (payment_recollection_t).
 */
export async function filePaymentRequests(
  tx: Transaction | Database,
  kind: FileKind,
  files: { id: number; mca_ref: string }[],
): Promise<FilePayment[]> {
  if (files.length === 0) return [];
  const src = SOURCES[kind];
  const refs = sql.join(files.map((f) => sql`${f.mca_ref.toUpperCase()}`), sql`, `);
  const idByRef = new Map(files.map((f) => [f.mca_ref.toUpperCase(), f.id]));

  const [stages, rows] = await Promise.all([
    loadPaymentStages(),
    tx.execute(sql`
      SELECT DISTINCT ON (pr.id)
             upper(e->>'mca_ref') AS mca_ref, pr.id, pr.requestee, pr.beneficiary,
             pr.amount::float8 AS amount, pr.currency AS currency_id, c.currency_short_name AS currency,
             pr.payment_type, pr.dept_approval, pr.finance_approval, pr.management_approval,
             pr.under_process, pr.paid_approval,
             to_char(pr.created_at, 'YYYY-MM-DD') AS created_at,
             (SELECT rc.status FROM payment_recollection_t rc
               WHERE rc.payment_request_id = pr.id ORDER BY rc.id DESC LIMIT 1) AS recollection_status,
             (SELECT rc.id FROM payment_recollection_t rc
               WHERE rc.payment_request_id = pr.id ORDER BY rc.id DESC LIMIT 1) AS recollection_id,
             (SELECT rc.recovered_amount::float8 FROM payment_recollection_t rc
               WHERE rc.payment_request_id = pr.id ORDER BY rc.id DESC LIMIT 1) AS recovered_amount,
             (SELECT to_char(rc.recovered_date, 'YYYY-MM-DD') FROM payment_recollection_t rc
               WHERE rc.payment_request_id = pr.id ORDER BY rc.id DESC LIMIT 1) AS recovered_date
      FROM payment_request_t pr
      LEFT JOIN currency_master_t c ON c.id = pr.currency,
           jsonb_array_elements(COALESCE(pr.mca_data, '[]'::jsonb)) e
      WHERE pr.display = 'Y' AND pr.pay_for = ${src.payFor}
        AND upper(e->>'mca_ref') IN (${refs})
      ORDER BY pr.id`),
  ]);

  type Row = PaymentApprovalState & {
    mca_ref: string; id: number; requestee: string | null; beneficiary: string | null;
    amount: number | null; currency_id: number | null; currency: string | null;
    created_at: string | null; recollection_status: string | null; recollection_id: number | null;
    recovered_amount: number | null; recovered_date: string | null;
  };
  return (rows as unknown as Rows<Row>).rows.map((r) => {
    const status = paymentStatus(r, stages);
    return {
      payment_id: r.id,
      mca_ref: r.mca_ref,
      file_id: idByRef.get(r.mca_ref) ?? 0,
      requestee: r.requestee,
      beneficiary: r.beneficiary,
      amount: N(r.amount),
      currency_id: r.currency_id,
      currency: r.currency,
      status_key: status.key,
      status_label: status.label,
      // "Already paid" is the one that costs money to cancel around.
      paid: status.key === 'paid',
      created_at: r.created_at,
      recollection_id: r.recollection_id,
      recollection_status: r.recollection_status,
      recovered_amount: r.recovered_amount,
      recovered_date: r.recovered_date,
    };
  });
}

// ---------------------------------------------------------------------------
// CANCEL
// ---------------------------------------------------------------------------

export interface CancelFilesInput {
  kind: FileKind;
  clientId: number;
  fileIds: number[];
  reasonId: number;
  /** ISO YYYY-MM-DD. */
  cancelledDate: string;
  actorId: number;
  /**
   * The operator has seen the payment requests raised against these files and
   * confirmed anyway. Without it the call is refused and returns them, so a file
   * is never cancelled in ignorance of money already spent on it.
   */
  acknowledgePayments?: boolean;
}

/** `conn` lets a caller nest it in its own transaction (a savepoint) — tests roll it back. */
export async function cancelFiles(
  input: CancelFilesInput,
  conn: Database | Transaction = db,
): Promise<{ cancelled: string[] }> {
  const src = SOURCES[input.kind];
  const t = sql.identifier(src.table);
  const ref = sql.identifier(src.refCol);
  const ids = sql.join(input.fileIds.map((id) => sql`${id}`), sql`, `);

  return conn.transaction(async (tx) => {
    const reasonRows = await tx.execute(sql`
      SELECT reason_name FROM cancellation_reason_master_t WHERE id = ${input.reasonId} AND display = 'Y'`);
    const reason = (reasonRows as unknown as Rows<{ reason_name: string }>).rows[0]?.reason_name;
    if (!reason) throw new ValidationError('Cancellation Reason: choose a reason from the list.', { field: 'reason_id' });

    const statusId = await cancelledStatusId(tx);

    // Locked, so nobody invoices or cancels them between the check and the write.
    const found = await tx.execute(sql`
      SELECT f.*, f.${ref} AS ref_value FROM ${t} f
      WHERE f.id IN (${ids}) AND f.client_id = ${input.clientId} AND f.display = 'Y'
      FOR UPDATE`);
    const rows = (found as unknown as Rows<Record<string, unknown>>).rows;
    if (rows.length !== input.fileIds.length) {
      throw new NotFoundError('One or more of the chosen MCA references no longer exist for this client — reload the list and choose again.');
    }
    const already = rows.filter((r) => Number(r['clearing_status']) === statusId).map((r) => String(r['ref_value']));
    if (already.length > 0) {
      throw new ConflictError(`Already cancelled: ${already.join(', ')}.`, { field: 'file_ids' });
    }

    const files = rows.map((r) => ({ id: Number(r['id']), mca_ref: String(r['ref_value']) }));
    // An invoice bills these files — cancelling under it would leave it charging
    // for a file that no longer exists, so that is still refused outright.
    const holders = await fileHolders(tx, input.kind, files);
    if (holders.length > 0) {
      const named = holders.map((h) => `${h.mca_ref} (${h.held_by})`).join(', ');
      throw new ConflictError(
        `Not cancelled — ${holders.length === 1 ? 'this file is' : 'these files are'} still on a live record: ${named}. Remove ${holders.length === 1 ? 'it' : 'them'} from there first.`,
        { field: 'file_ids', holders },
      );
    }

    // A payment request is shown and confirmed, not removed.
    const payments = await filePaymentRequests(tx, input.kind, files);
    if (payments.length > 0 && !input.acknowledgePayments) {
      const paid = payments.filter((pmt) => pmt.paid);
      const open = payments.filter((pmt) => !pmt.paid);
      const money = (list: FilePayment[]): string =>
        list.map((pmt) => `#${pmt.payment_id} ${fmt(pmt.amount)} ${pmt.currency ?? ''}`.trim()).join(', ');
      throw new ConflictError(
        [
          `${payments.length} payment request${payments.length === 1 ? '' : 's'} exist against ${files.length === 1 ? 'this file' : 'these files'}.`,
          paid.length > 0 ? `Already paid: ${money(paid)}.` : '',
          open.length > 0 ? `Still in approval: ${money(open)}.` : '',
          'Confirm to cancel anyway — anything already paid becomes an amount to recollect.',
        ].filter(Boolean).join(' '),
        { field: 'file_ids', payments, needs_payment_confirmation: true },
      );
    }

    const remark = `CANCELLED — ${reason}`;
    const remarksSet = src.remarkLog
      ? sql`remarks = (CASE WHEN jsonb_typeof(remarks) = 'array' THEN remarks ELSE '[]'::jsonb END)
            || jsonb_build_array(jsonb_build_object('date', ${input.cancelledDate}::text, 'remark', ${remark}::text))`
      : sql`remarks = concat_ws(E'\n', NULLIF(remarks, ''), ${`${formatDate(input.cancelledDate)} — ${remark}`}::text)`;

    const updated = await tx.execute(sql`
      UPDATE ${t} SET
        clearing_status = ${statusId},
        cancellation_reason_id = ${input.reasonId},
        cancelled_date = ${input.cancelledDate}::date,
        cancelled_by = ${input.actorId},
        ${remarksSet},
        updated_by = ${input.actorId},
        updated_at = now()
      WHERE id IN (${ids})
      RETURNING *`);
    const after = new Map(
      (updated as unknown as Rows<Record<string, unknown>>).rows.map((r) => [Number(r['id']), r]),
    );

    for (const before of rows) {
      const id = Number(before['id']);
      await recordAudit(tx, {
        actorId: input.actorId,
        action: 'cancel',
        entityType: `page:${src.page}`,
        entityId: id,
        before,
        after: after.get(id),
        metadata: { reason, cancelled_date: input.cancelledDate, via: 'file-cancellation' },
      });
      for (const pmt of payments.filter((x) => x.paid && x.file_id === id)) {
        // Copied at this moment: a later edit of the request must not change
        // what is being claimed back.
        await tx.execute(sql`
          INSERT INTO payment_recollection_t
            (payment_request_id, file_kind, file_id, file_ref, amount, currency_id, status, created_by)
          SELECT ${pmt.payment_id}, ${input.kind}, ${id}, ${pmt.mca_ref}, ${pmt.amount}, ${pmt.currency_id}, 'pending', ${input.actorId}
          WHERE NOT EXISTS (
            SELECT 1 FROM payment_recollection_t x
            WHERE x.payment_request_id = ${pmt.payment_id} AND x.file_id = ${id} AND x.status = 'pending')`);
      }

      await raiseEvent(tx, 'file.cancelled', {
        actorUserId: input.actorId,
        creatorUserId: Number(before['created_by']) || null,
        context: {
          ref: String(before['ref_value'] ?? id),
          kind: src.label,
          reason,
          date: formatDate(input.cancelledDate),
        },
      });
    }
    return { cancelled: files.map((f) => f.mca_ref) };
  });
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export interface CancelledFileRow {
  key: string;
  kind: FileKind;
  kind_label: string;
  id: number;
  /** Live payment requests raised against the file. */
  payment_count: number;
  /** Paid out and not yet recovered — what the recollect icon is about. */
  to_recollect: number;
  mca_ref: string;
  client_name: string | null;
  client_legal_name: string | null;
  license_number: string | null;
  weight: number;
  fob: number | null;
  reason: string | null;
  cancelled_date: string | null;
  cancelled_by: string | null;
}

/** Every cancelled file of all three kinds, newest cancellation first. */
export async function listCancelledFiles(): Promise<CancelledFileRow[]> {
  const part = (kind: FileKind): SQL => {
    const src = SOURCES[kind];
    return sql`
      SELECT ${kind}::text AS kind, f.id, f.${sql.identifier(src.refCol)} AS mca_ref,
             c.short_name AS client_name, c.company_name AS client_legal_name,
             ${src.licensed ? sql`l.license_number` : sql`NULL::text`} AS license_number,
             f.weight, ${kind === 'local' ? sql`NULL::numeric` : sql`f.fob`} AS fob,
             r.reason_name AS reason,
             to_char(f.cancelled_date, 'YYYY-MM-DD') AS cancelled_date,
             u.full_name AS cancelled_by, f.updated_at,
             (SELECT count(DISTINCT pr.id)::int
                FROM payment_request_t pr, jsonb_array_elements(COALESCE(pr.mca_data, '[]'::jsonb)) e
               WHERE pr.display = 'Y' AND pr.pay_for = ${src.payFor}
                 AND upper(e->>'mca_ref') = upper(f.${sql.identifier(src.refCol)})) AS payment_count,
             (SELECT COALESCE(sum(rc.amount - COALESCE(rc.recovered_amount, 0)), 0)::float8
                FROM payment_recollection_t rc
               WHERE rc.file_kind = ${kind} AND rc.file_id = f.id AND rc.status = 'pending') AS to_recollect
      FROM ${sql.identifier(src.table)} f
      LEFT JOIN client_master_t c ON c.id = f.client_id
      ${src.licensed ? sql`LEFT JOIN license_t l ON l.id = f.license_id` : sql``}
      LEFT JOIN cancellation_reason_master_t r ON r.id = f.cancellation_reason_id
      LEFT JOIN users_t u ON u.id = f.cancelled_by
      WHERE f.display = 'Y' AND NOT ${fileNotCancelled(sql`f.clearing_status`)}`;
  };
  const rows = await db.execute(sql`
    SELECT * FROM (${part('import')} UNION ALL ${part('export')} UNION ALL ${part('local')}) x
    ORDER BY x.cancelled_date DESC NULLS LAST, x.updated_at DESC
    LIMIT 2000`);
  type Row = Omit<CancelledFileRow, 'key' | 'kind_label' | 'weight' | 'fob' | 'to_recollect'> & {
    weight: unknown; fob: unknown; to_recollect: unknown;
  };
  return (rows as unknown as Rows<Row>).rows.map((r) => ({
    ...r,
    key: `${r.kind}:${r.id}`,
    kind_label: SOURCES[r.kind].label,
    weight: N(r.weight),
    fob: r.fob == null ? null : N(r.fob),
    payment_count: N(r.payment_count),
    to_recollect: N(r.to_recollect),
  }));
}

// ---------------------------------------------------------------------------
// RECOLLECTION — money paid on a file that was then cancelled
// ---------------------------------------------------------------------------

/** One cancelled file's payment requests, with any recollection opened on them. */
export async function cancelledFilePayments(kind: FileKind, fileId: number): Promise<FilePayment[]> {
  const src = SOURCES[kind];
  const found = await db.execute(sql`
    SELECT id, ${sql.identifier(src.refCol)} AS ref FROM ${sql.identifier(src.table)} WHERE id = ${fileId}`);
  const file = (found as unknown as Rows<{ id: number; ref: string | null }>).rows[0];
  if (!file?.ref) throw new NotFoundError('This file no longer exists — reload the list.');
  return filePaymentRequests(db, kind, [{ id: file.id, mca_ref: file.ref }]);
}

export interface RecollectionUpdate {
  status: 'pending' | 'recovered' | 'written_off';
  recovered_amount: number | null;
  recovered_date: string | null;
  note: string | null;
}

/** Record what was recovered (or that it never will be). Audited (§4.28). */
export async function updateRecollection(id: number, input: RecollectionUpdate, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const found = await tx.execute(sql`SELECT * FROM payment_recollection_t WHERE id = ${id} FOR UPDATE`);
    const before = (found as unknown as Rows<Record<string, unknown>>).rows[0];
    if (!before) throw new NotFoundError('This recollection no longer exists — reload the list.');
    const owed = N(before['amount']);
    if (input.status === 'recovered' && (input.recovered_amount ?? 0) > owed) {
      throw new ValidationError(
        `Recovered amount is ${fmt(input.recovered_amount ?? 0)} — more than the ${fmt(owed)} that was paid. Correct the amount.`,
        { field: 'recovered_amount' },
      );
    }
    await tx.execute(sql`
      UPDATE payment_recollection_t SET
        status = ${input.status},
        recovered_amount = ${input.status === 'recovered' ? input.recovered_amount : null},
        recovered_date = ${input.status === 'pending' ? null : input.recovered_date}::date,
        note = ${input.note},
        recovered_by = ${input.status === 'pending' ? null : actorId},
        updated_at = now()
      WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId,
      action: 'update',
      entityType: 'payment_recollection',
      entityId: id,
      before,
      after: { ...before, ...input },
    });
  });
}
