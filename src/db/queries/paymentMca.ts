// §2 step 6 (Payment Request) — MCA reference management for the payment grid.
// Ported from main's validate_mca_exists / check_mca_duplicate / get_mca_refs_by_client
// (PaymentController.php). References live on payment_request_t.mca_data (JSONB
// [{mca_ref, amount}]); the header amount must equal the sum of the lines.
//
// pay_for → tracking table: 0 Import→imports_t, 1 Export→exports_t, 2 Local→locals_t;
// 3 Other / 4 Pre-Payment carry auto-generated references and skip existence checks.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentRequest, type McaLine } from '@/db/schema';

// Expense type whose duplicate references are explicitly permitted (main's rule).
// TODO(config): move the dup-exempt expense types to an expense_type_master_t flag.
const DUP_EXEMPT_EXPENSE_TYPE = 25;

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

interface TrackingSource {
  table: 'imports_t' | 'exports_t' | 'locals_t';
  refCol: 'mca_ref' | 'mca_lt_reference';
  excludeCancelled: boolean; // imports exclude clearing_status = 7
}

function sourceFor(payFor: number | null): TrackingSource | null {
  switch (payFor) {
    case 0:
      return { table: 'imports_t', refCol: 'mca_ref', excludeCancelled: true };
    case 1:
      return { table: 'exports_t', refCol: 'mca_ref', excludeCancelled: false };
    case 2:
      return { table: 'locals_t', refCol: 'mca_lt_reference', excludeCancelled: false };
    default:
      return null; // 3 Other / 4 Pre-Payment → no tracking table
  }
}

// ---------------------------------------------------------------------------
// GRID READ
// ---------------------------------------------------------------------------
export interface McaGridData {
  header: {
    id: number;
    client_id: number | null;
    pay_for: number | null;
    expense_type: number | null;
    amount: number;
    editable: boolean;
  };
  refs: McaLine[];
  availableRefs: { mca_ref: string }[];
}

export async function mcaGridData(paymentId: number): Promise<McaGridData | null> {
  const [row] = await db
    .select({
      id: paymentRequest.id,
      client_id: paymentRequest.clientId,
      pay_for: paymentRequest.payFor,
      expense_type: paymentRequest.expenseType,
      amount: paymentRequest.amount,
      mca_data: paymentRequest.mcaData,
      dept: paymentRequest.deptApproval,
      finance: paymentRequest.financeApproval,
      management: paymentRequest.managementApproval,
      under: paymentRequest.underProcess,
      paid: paymentRequest.paidApproval,
    })
    .from(paymentRequest)
    .where(and(eq(paymentRequest.id, paymentId), eq(paymentRequest.display, 'Y')));
  if (!row) return null;

  const stages = [row.dept, row.finance, row.management, row.under, row.paid];
  const rejected = stages.some((s) => s === -1);
  const inChain = row.dept !== null && row.dept !== undefined;
  const editable = rejected || !inChain;

  return {
    header: {
      id: row.id,
      client_id: row.client_id,
      pay_for: row.pay_for,
      expense_type: row.expense_type,
      amount: N(row.amount),
      editable,
    },
    refs: (row.mca_data ?? []) as McaLine[],
    availableRefs: await availableRefs(row.client_id, row.pay_for),
  };
}

// Reference picker: the client's own tracking references for this pay_for.
export async function availableRefs(
  clientId: number | null,
  payFor: number | null,
): Promise<{ mca_ref: string }[]> {
  const src = sourceFor(payFor);
  if (!src || !clientId) return [];

  const filters = [
    sql`client_id = ${clientId}`,
    sql`display = 'Y'`,
    sql`${sql.identifier(src.refCol)} IS NOT NULL`,
    sql`${sql.identifier(src.refCol)} <> ''`,
  ];
  if (src.excludeCancelled) filters.push(sql`(clearing_status IS NULL OR clearing_status <> 7)`);

  const rows = await db.execute(sql`
    SELECT ${sql.identifier(src.refCol)} AS mca_ref
    FROM ${sql.identifier(src.table)}
    WHERE ${sql.join(filters, sql` AND `)}
    ORDER BY id DESC LIMIT 500`);
  return (rows as unknown as { rows: { mca_ref: string }[] }).rows;
}

// ---------------------------------------------------------------------------
// BATCH VALIDATE — existence (tracking table) + duplicate (other requests)
// Mirrors main's validate_mca_batch fix (one query per concern, not per ref).
// ---------------------------------------------------------------------------
export interface RefVerdict {
  mca_ref: string;
  exists: boolean; // present in the tracking table for this client/pay_for
  duplicate: number | null; // id of another request already using it, or null
  valid: boolean;
}

export interface ValidateInput {
  refs: string[];
  payFor: number | null;
  clientId: number | null;
  expenseType: number | null;
  paymentId: number | null;
}

export async function validateRefs({
  refs,
  payFor,
  clientId,
  expenseType,
  paymentId,
}: ValidateInput): Promise<RefVerdict[]> {
  const uniq = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean))).slice(0, 200);
  if (uniq.length === 0) return [];
  const upper = uniq.map((r) => r.toUpperCase());

  // 1) existence
  const existsSet = new Set<string>();
  const src = sourceFor(payFor);
  if (!src) {
    // Other / Pre-Payment: auto-generated references are always "exists".
    upper.forEach((r) => existsSet.add(r));
  } else {
    const filters = [sql`upper(${sql.identifier(src.refCol)}) = ANY(${upper})`, sql`display = 'Y'`];
    if (clientId) filters.push(sql`client_id = ${clientId}`);
    if (src.excludeCancelled) filters.push(sql`(clearing_status IS NULL OR clearing_status <> 7)`);
    const rows = await db.execute(sql`
      SELECT DISTINCT upper(${sql.identifier(src.refCol)}) AS ref
      FROM ${sql.identifier(src.table)}
      WHERE ${sql.join(filters, sql` AND `)}`);
    for (const r of (rows as unknown as { rows: { ref: string }[] }).rows) existsSet.add(r.ref);
  }

  // 2) duplicates against other requests with the same expense type
  const dupMap = new Map<string, number>();
  if (expenseType != null && expenseType !== DUP_EXEMPT_EXPENSE_TYPE) {
    const rows = await db.execute(sql`
      SELECT DISTINCT upper(e->>'mca_ref') AS ref, pr.id AS payment_id
      FROM ${paymentRequest} pr,
           jsonb_array_elements(COALESCE(pr.mca_data, '[]'::jsonb)) e
      WHERE pr.expense_type = ${expenseType}
        AND pr.display = 'Y'
        AND pr.id <> ${paymentId ?? -1}
        AND upper(e->>'mca_ref') = ANY(${upper})`);
    for (const r of (rows as unknown as { rows: { ref: string; payment_id: number }[] }).rows) {
      dupMap.set(r.ref, r.payment_id);
    }
  }

  return uniq.map((ref) => {
    const up = ref.toUpperCase();
    const exists = existsSet.has(up);
    const duplicate = dupMap.get(up) ?? null;
    return { mca_ref: ref, exists, duplicate, valid: exists && duplicate === null };
  });
}

// ---------------------------------------------------------------------------
// TRANSACTION-PAGE GUARD
// ---------------------------------------------------------------------------
/**
 * Validate the reference lines a payment transaction page is about to write, in
 * the shape the generic page-save route expects: an error message, or null when
 * the lines are acceptable. Counterpart to assertImportPartielleCapacity — the
 * rule is payment-specific, so it hangs off the route's page hook rather than
 * living in the generic writer.
 *
 * Runs against the MERGED context (stored row + this submission), so a reference
 * is re-checked when the client or expense type changes on another accordion,
 * not only when the grid itself is edited.
 */
export async function assertPaymentMcaRefs(
  ctx: Record<string, unknown>,
  excludePaymentId: number | null,
): Promise<string | null> {
  const lines = parseLines(ctx['mca_data']);
  if (lines.length === 0) return null; // nothing to check; `required` covers absence
  if (lines.length > 50) return 'A request can carry at most 50 references';

  const seen = new Set<string>();
  for (const l of lines) {
    const up = l.mca_ref.toUpperCase();
    if (seen.has(up)) return `Reference ${l.mca_ref} is listed more than once`;
    seen.add(up);
  }

  const verdicts = await validateRefs({
    refs: lines.map((l) => l.mca_ref),
    payFor: ctx['pay_for'] === null || ctx['pay_for'] === undefined ? null : Number(ctx['pay_for']),
    clientId: ctx['client_id'] ? Number(ctx['client_id']) : null,
    expenseType: ctx['expense_type'] ? Number(ctx['expense_type']) : null,
    paymentId: excludePaymentId,
  });
  const bad = verdicts.filter((v) => !v.valid);
  if (bad.length === 0) return null;

  const detail = bad
    .map((v) => `${v.mca_ref} (${!v.exists ? 'not found for this client' : `already used by request #${v.duplicate}`})`)
    .join(', ');
  return `Invalid reference${bad.length === 1 ? '' : 's'}: ${detail}`;
}

/** The first reference, denormalised onto payment_request_t.mca_ref for list/search. */
export function firstMcaRef(value: unknown): string | null {
  return parseLines(value)[0]?.mca_ref ?? null;
}

/** Reference lines from a JSONB column or the JSON string a form may submit. */
function parseLines(value: unknown): McaLine[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({ mca_ref: String(l.mca_ref ?? '').trim(), amount: round2(N(l.amount)) }))
    .filter((l) => l.mca_ref !== '');
}

// ---------------------------------------------------------------------------
// SAVE — validate, then persist mca_data + denormalised mca_ref + amount
// ---------------------------------------------------------------------------
export interface McaSaveResult {
  total: number;
  count: number;
}

export class McaSaveError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'McaSaveError';
  }
}

export async function saveMcaRefs(paymentId: number, lines: McaLine[], uid: number): Promise<McaSaveResult> {
  const grid = await mcaGridData(paymentId);
  if (!grid) throw new McaSaveError('Payment request not found');
  if (!grid.header.editable) {
    throw new McaSaveError('This request is already in the approval chain and can no longer be edited');
  }
  if (lines.length > 50) throw new McaSaveError('A request can carry at most 50 references');

  const clean = lines
    .map((l) => ({ mca_ref: String(l.mca_ref ?? '').trim(), amount: round2(N(l.amount)) }))
    .filter((l) => l.mca_ref !== '');

  // reject in-form duplicates
  const seen = new Set<string>();
  for (const l of clean) {
    const up = l.mca_ref.toUpperCase();
    if (seen.has(up)) throw new McaSaveError(`Reference ${l.mca_ref} is listed more than once`);
    seen.add(up);
  }

  // server-side re-validation (existence + cross-request duplicates)
  const verdicts = await validateRefs({
    refs: clean.map((l) => l.mca_ref),
    payFor: grid.header.pay_for,
    clientId: grid.header.client_id,
    expenseType: grid.header.expense_type,
    paymentId,
  });
  const bad = verdicts.filter((v) => !v.valid);
  if (bad.length) {
    throw new McaSaveError('Some references are invalid', {
      invalid: bad.map((v) => ({
        mca_ref: v.mca_ref,
        reason: !v.exists ? 'not found for this client' : `already used by request #${v.duplicate}`,
      })),
    });
  }

  const total = round2(clean.reduce((s, l) => s + l.amount, 0));
  await db
    .update(paymentRequest)
    .set({
      mcaData: clean,
      mcaRef: clean[0]?.mca_ref ?? null,
      amount: String(total),
      updatedBy: uid,
      updatedAt: new Date(),
    })
    .where(eq(paymentRequest.id, paymentId));

  return { total, count: clean.length };
}
