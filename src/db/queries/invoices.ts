// §2 step 5 (Invoicing) — shared query helpers for Export + Import invoices.
// One module drives both kinds (§4.10) so the two route families stay in sync.
//
// The invoice HEADER is written by the transaction-pages runtime (master_page
// slug export-invoices / import-invoices). These helpers own everything the
// custom grid needs: the child MCA details + line items, the option lists the
// grid selects from, and the aggregate totals recomputed on every grid save.
//
// Totals here are the BASIC aggregation (sum of line items). The client-specific
// special-item rules (RIE/RLS/FSR, OGEFREM-container & CEEC-weight matching, CIF
// splitting, autres-taxes recalculation) are deferred — see the module notes in
// exportInvoices.ts / importInvoices.ts.
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import { formatDate } from '@/lib/formatDate';
import { recordAudit } from '@/lib/audit/recordAudit';
import { raiseEvent } from './notifications';
import { fileNotCancelled } from '@/db/queries/fileCancellation';
import { gridSaveSchema, type GridSaveInput } from '@/schemas/invoiceGrid';
import {
  exportInvoices,
  exportInvoiceMcaDetails,
  exportInvoiceItems,
  importInvoices,
  importInvoiceItems,
  clientMaster,
} from '@/db/schema';

export type InvoiceKind = 'export' | 'import';

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
export interface InvoiceListRow {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  invoice_date: string | null;
  validated: number;
  total_usd: number;
  created_at: string;
}

export interface ListParams {
  q?: string;
  status?: string; // 'all' | 'pending' | 'validated' | 'dgi'
  page: number;
  pageSize: number;
}

export async function listInvoices(
  kind: InvoiceKind,
  { q, status, page, pageSize }: ListParams,
): Promise<{ items: InvoiceListRow[]; total: number }> {
  const t = kind === 'export' ? exportInvoices : importInvoices;
  const totalExpr =
    kind === 'export'
      ? sql<number>`COALESCE(${exportInvoices.fobUsd}, 0)`
      : sql<number>`COALESCE(${importInvoices.calculatedTotalAmount}, 0)`;

  const filters = [eq(t.display, 'Y')];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    filters.push(
      or(ilike(t.invoiceRef, like), ilike(clientMaster.companyName, like), ilike(clientMaster.shortName, like))!,
    );
  }
  if (status === 'pending') filters.push(eq(t.validated, 0));
  else if (status === 'validated') filters.push(sql`${t.validated} >= 1`);
  else if (status === 'dgi') filters.push(eq(t.validated, 2));

  const where = and(...filters);

  const dateExpr =
    kind === 'export'
      ? sql<string | null>`to_char(${exportInvoices.invoiceDate}, 'YYYY-MM-DD')`
      : sql<string | null>`NULL::text`;

  const rows = await db
    .select({
      id: t.id,
      invoice_ref: t.invoiceRef,
      client_id: t.clientId,
      client_name: sql<string | null>`COALESCE(${clientMaster.shortName}, ${clientMaster.companyName})`,
      invoice_date: dateExpr,
      validated: t.validated,
      total_usd: totalExpr,
      created_at: sql<string>`to_char(${t.createdAt}, 'YYYY-MM-DD HH24:MI')`,
    })
    .from(t)
    .leftJoin(clientMaster, eq(t.clientId, clientMaster.id))
    .where(where)
    .orderBy(desc(t.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t)
    .leftJoin(clientMaster, eq(t.clientId, clientMaster.id))
    .where(where);

  return {
    items: rows.map((r) => ({ ...r, validated: N(r.validated), total_usd: N(r.total_usd) })),
    total: N(count),
  };
}

// ---------------------------------------------------------------------------
// STATISTICS (stat cards)
// ---------------------------------------------------------------------------
export interface InvoiceStats {
  total: number;
  pending: number;
  validated: number;
  dgi: number;
}

export async function invoiceStatistics(kind: InvoiceKind): Promise<InvoiceStats> {
  const t = kind === 'export' ? exportInvoices : importInvoices;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${t.validated} = 0)::int`,
      validated: sql<number>`count(*) FILTER (WHERE ${t.validated} >= 1)::int`,
      dgi: sql<number>`count(*) FILTER (WHERE ${t.validated} = 2)::int`,
    })
    .from(t)
    .where(eq(t.display, 'Y'));
  return {
    total: N(row?.total),
    pending: N(row?.pending),
    validated: N(row?.validated),
    dgi: N(row?.dgi),
  };
}

// ---------------------------------------------------------------------------
// GRID READ — everything the create/edit grid needs for one invoice
// ---------------------------------------------------------------------------
export interface GridItem {
  id?: number;
  quotation_item_id: number | null;
  category_id: number | null;
  category_name: string | null;
  category_header: string | null;
  display_order: number;
  item_id: number | null;
  item_name: string | null;
  unit_id: number | null;
  unit_text: string | null;
  quantity: number;
  taux_usd: number;
  cost_usd: number;
  currency_id: number | null;
  has_tva: number;
  tva_usd: number;
  subtotal_usd: number;
  total_usd: number;
  /** Import's customs category, billed in CDF (main's category-1 columns). */
  cif_split: number;
  percentage: number;
  rate_cdf: number;
  vat_cdf: number;
  total_cdf: number;
}

export interface GridMca {
  id?: number;
  mca_id: number | null;
  display_order: number;
  lot_number: string | null;
  declaration_no: string | null;
  declaration_date: string | null;
  liquidation_no: string | null;
  liquidation_date: string | null;
  liquidation_amount: number;
  liquidation_usd: number;
  quittance_no: string | null;
  quittance_date: string | null;
  horse: string | null;
  trailer_1: string | null;
  trailer_2: string | null;
  container: string | null;
  weight: number;
  buyer: string | null;
  /** Export: the DGDA rate this file's liquidation converts at. */
  bcc_rate: number;
  feet_container_id: number | null;
  ceec_amount: number;
  cgea_amount: number;
  occ_amount: number;
  lmc_amount: number;
  ogefrem_amount: number;
}

export interface GridData {
  header: {
    id: number;
    client_id: number | null;
    license_id: number | null;
    validated: number;
  };
  items: GridItem[];
  mcaDetails: GridMca[];
  clientQuotations: { id: number; quotation_ref: string; quotation_date: string | null }[];
  availableMcas: PickerMca[];
}

export async function gridData(kind: InvoiceKind, invoiceId: number): Promise<GridData | null> {
  if (kind === 'export') {
    const [inv] = await db
      .select({
        id: exportInvoices.id,
        client_id: exportInvoices.clientId,
        license_id: exportInvoices.licenseId,
        validated: exportInvoices.validated,
      })
      .from(exportInvoices)
      .where(and(eq(exportInvoices.id, invoiceId), eq(exportInvoices.display, 'Y')));
    if (!inv) return null;

    const items = await db
      .select()
      .from(exportInvoiceItems)
      .where(eq(exportInvoiceItems.exportInvoiceId, invoiceId))
      .orderBy(exportInvoiceItems.displayOrder, exportInvoiceItems.id);

    const mca = await db
      .select()
      .from(exportInvoiceMcaDetails)
      .where(eq(exportInvoiceMcaDetails.exportInvoiceId, invoiceId))
      .orderBy(exportInvoiceMcaDetails.displayOrder, exportInvoiceMcaDetails.id);

    const quotations = await clientQuotations(inv.client_id);
    const mcas = await availableExportMcas(inv.client_id, { licenseId: inv.license_id, invoiceId });

    return {
      header: { id: inv.id, client_id: inv.client_id, license_id: inv.license_id, validated: N(inv.validated) },
      items: items.map(mapExportItem),
      mcaDetails: mca.map(mapExportMca),
      clientQuotations: quotations,
      availableMcas: mcas,
    };
  }

  const [inv] = await db
    .select({
      id: importInvoices.id,
      client_id: importInvoices.clientId,
      license_id: importInvoices.licenseId,
      mca_ids: importInvoices.mcaIds,
      validated: importInvoices.validated,
    })
    .from(importInvoices)
    .where(and(eq(importInvoices.id, invoiceId), eq(importInvoices.display, 'Y')));
  if (!inv) return null;

  const items = await db
    .select()
    .from(importInvoiceItems)
    .where(and(eq(importInvoiceItems.invoiceId, invoiceId), eq(importInvoiceItems.display, 'Y')))
    .orderBy(importInvoiceItems.sortOrder, importInvoiceItems.id);

  const quotations = await clientQuotations(inv.client_id);
  const mcas = await availableImportMcas(inv.client_id, { invoiceId });

  // Import stores selected MCAs as a CSV of imports_t ids; surface them as
  // pseudo GridMca rows so the grid can render/toggle them uniformly.
  const selectedIds = (inv.mca_ids ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const mcaDetails: GridMca[] = mcas
    .filter((m) => selectedIds.includes(m.id))
    .map((m) => emptyMca(m.id));

  return {
    header: { id: inv.id, client_id: inv.client_id, license_id: inv.license_id, validated: N(inv.validated) },
    items: items.map(mapImportItem),
    mcaDetails,
    clientQuotations: quotations,
    availableMcas: mcas,
  };
}

/**
 * The pickers the grid renders, for a CLIENT rather than an invoice.
 *
 * `gridData` can only answer this for an invoice that already exists, which is
 * exactly the case a NEW invoice is not. Both underlying queries key off the
 * client alone, so the grid can populate its dropdowns from the client chosen
 * on the header accordion — the same way the payment grid scopes itself to the
 * client on its form — and the items can be filled in before the first save.
 */
export async function gridPickers(
  kind: InvoiceKind,
  clientId: number | null,
  scope: McaScope = {},
): Promise<{
  clientQuotations: { id: number; quotation_ref: string; quotation_date: string | null }[];
  availableMcas: PickerMca[];
}> {
  const [quotationsForClient, mcas] = await Promise.all([
    clientQuotations(clientId),
    kind === 'export' ? availableExportMcas(clientId, scope) : availableImportMcas(clientId, scope),
  ]);
  return { clientQuotations: quotationsForClient, availableMcas: mcas };
}

/**
 * Narrows the MCA picker the way main's getMCAReferences does.
 *
 * `invoiceId` is the invoice being edited: its OWN files stay offered, so
 * reopening a saved invoice does not hide the files it already carries.
 * `licenseId` scopes an export invoice to the licence on its header — main
 * listed only that licence's files.
 */
export interface McaScope {
  licenseId?: number | null;
  invoiceId?: number | null;
}

async function clientQuotations(
  clientId: number | null,
): Promise<{ id: number; quotation_ref: string; quotation_date: string | null }[]> {
  if (!clientId) return [];
  const rows = await db.execute(sql`
    SELECT id, quotation_ref, to_char(quotation_date, 'YYYY-MM-DD') AS quotation_date
    FROM quotations_t WHERE client_id = ${clientId} AND display = 'Y' ORDER BY id DESC LIMIT 200`);
  return (rows as unknown as { rows: { id: number; quotation_ref: string; quotation_date: string | null }[] }).rows;
}

// ---------------------------------------------------------------------------
// WHICH FILES CAN STILL BE INVOICED — one definition, three readers: the grid's
// file picker, the "Pending for Invoicing" count, and the pending list/export.
// They disagreed before this (the count excluded clearing status 4, IN TRANSIT,
// where main excludes CANCELLED), so the card and the picker offered different
// files. Fixed table aliases: `i` for imports_t, `e` for exports_t.
// ---------------------------------------------------------------------------

/**
 * An import file cleared through customs: live, quittanced, not cancelled.
 * Cancelled is matched by the status NAME, not by id 7 as main did, so a
 * database that numbers the master differently still gets the same answer.
 */
export const IMPORT_FILE_CLEARED = sql`
  i.display = 'Y'
  AND i.quittance_date IS NOT NULL
  AND ${fileNotCancelled(sql`i.clearing_status`)}`;

/** No live import invoice other than `selfId` lists this file in its `mca_ids`. */
export function importFileNotInvoiced(selfId = 0): SQL {
  // Split and compared by whole entry — `LIKE '%12%'` would call file 12
  // invoiced when only file 123 is (§4.37).
  return sql`NOT EXISTS (
    SELECT 1 FROM import_invoices_t inv
    WHERE inv.display = 'Y' AND inv.id <> ${selfId}
      AND i.id::text = ANY (string_to_array(replace(COALESCE(inv.mca_ids, ''), ' ', ''), ',')))`;
}

/** An export file cleared through customs: live and quittanced. */
// A cancelled export file is not invoiced either — the same rule as import.
export const EXPORT_FILE_CLEARED = sql`e.display = 'Y' AND e.quittance_date IS NOT NULL
  AND ${fileNotCancelled(sql`e.clearing_status`)}`;

/** No live export invoice other than `selfId` carries this file. */
export function exportFileNotInvoiced(selfId = 0): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM export_invoice_mca_details_t d
    JOIN export_invoices_t x ON x.id = d.export_invoice_id AND x.display = 'Y'
    WHERE d.mca_id = e.id AND d.export_invoice_id <> ${selfId})`;
}

/**
 * main's availability rule for an export file: cleared (it has a quittance
 * date), on the invoice's licence when one is chosen, and not already on
 * another live export invoice.
 */
async function availableExportMcas(
  clientId: number | null,
  { licenseId, invoiceId }: McaScope = {},
): Promise<{ id: number; mca_ref: string | null; label: string }[]> {
  if (!clientId) return [];
  const self = invoiceId && invoiceId > 0 ? invoiceId : 0;
  const rows = await db.execute(sql`
    SELECT e.id, e.mca_ref, e.buyer, e.weight
    FROM exports_t e
    WHERE e.client_id = ${clientId}
      AND ${EXPORT_FILE_CLEARED}
      AND e.mca_ref IS NOT NULL AND e.mca_ref <> ''
      ${licenseId ? sql`AND e.license_id = ${licenseId}` : sql``}
      AND ${exportFileNotInvoiced(self)}
    ORDER BY e.id DESC LIMIT 500`);
  return (rows as unknown as { rows: { id: number; mca_ref: string | null; buyer: string | null; weight: unknown }[] }).rows.map(
    (r) => ({
      id: r.id,
      mca_ref: r.mca_ref,
      label: `${r.mca_ref ?? r.id}${r.buyer ? ` — ${r.buyer}` : ''}${N(r.weight) > 0 ? ` · ${N(r.weight).toFixed(3)} MT` : ''}`,
    }),
  );
}

/** An MCA file as the invoice pickers offer it. Import fills the licence fields. */
export interface PickerMca {
  id: number;
  mca_ref: string | null;
  label: string;
  /** The file's licence — import picks licences first, then their files. */
  license_id?: number | null;
  license_number?: string | null;
  /** "FOB $78,350.54 · 12,373.80 kg · 03-08-2026" — the second line in the picker. */
  detail?: string;
}

/**
 * main's availability rule for an import file: cleared (quittanced, not
 * cancelled) and not already recorded on another live import invoice.
 *
 * Carries each file's licence, because the form picks LICENCES first and then
 * the files on them (main's getLicenses → getMCAReferences).
 */
async function availableImportMcas(
  clientId: number | null,
  { invoiceId }: McaScope = {},
): Promise<PickerMca[]> {
  if (!clientId) return [];
  const self = invoiceId && invoiceId > 0 ? invoiceId : 0;
  const rows = await db.execute(sql`
    SELECT i.id, i.mca_ref, i.fob, i.weight,
           to_char(i.customs_manifest_date, 'YYYY-MM-DD') AS manifest_date,
           i.license_id, l.license_number
    FROM imports_t i
    LEFT JOIN license_t l ON l.id = i.license_id
    WHERE i.client_id = ${clientId}
      AND ${IMPORT_FILE_CLEARED}
      AND i.mca_ref IS NOT NULL AND i.mca_ref <> ''
      AND ${importFileNotInvoiced(self)}
    ORDER BY i.id DESC LIMIT 500`);
  type Row = {
    id: number; mca_ref: string | null; fob: unknown; weight: unknown;
    manifest_date: string | null; license_id: number | null; license_number: string | null;
  };
  return (rows as unknown as { rows: Row[] }).rows.map((r) => {
    const detail = [
      N(r.fob) > 0 ? `FOB $${N(r.fob).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '',
      N(r.weight) > 0 ? `${N(r.weight).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : '',
      formatDate(r.manifest_date, ''),
    ].filter(Boolean).join(' · ');
    return {
      id: r.id,
      mca_ref: r.mca_ref,
      label: [r.mca_ref ?? String(r.id), detail].filter(Boolean).join(' · '),
      license_id: r.license_id,
      license_number: r.license_number,
      detail,
    };
  });
}

// ---------------------------------------------------------------------------
// QUOTATION ITEMS — load a quotation's items into the grid (grouped by category)
// ---------------------------------------------------------------------------
export async function quotationItemsForGrid(quotationId: number): Promise<GridItem[]> {
  const rows = await db.execute(sql`
    SELECT qi.id AS quotation_item_id, qi.category_id, qi.item_id, qi.unit_id, qi.unit_text,
           qi.quantity, qi.taux_usd, qi.cost_usd, qi.currency_id, qi.has_tva, qi.tva_usd,
           qi.subtotal_usd, qi.total_usd,
           qi.cif_split, qi.percentage, qi.rate_cdf, qi.vat_cdf, qi.total_cdf,
           cat.category_name, cat.category_header, COALESCE(cat.display_order, 999) AS display_order,
           it.item_name
    FROM quotation_items_t qi
    LEFT JOIN quotation_category_master_t cat ON cat.id = qi.category_id
    LEFT JOIN item_master_t it ON it.id = qi.item_id
    WHERE qi.quotation_id = ${quotationId} AND qi.display = 'Y'
    ORDER BY COALESCE(cat.display_order, 999), qi.id`);
  const list = (rows as unknown as { rows: Record<string, unknown>[] }).rows;
  return list.map((r) => ({
    quotation_item_id: r.quotation_item_id as number,
    category_id: (r.category_id as number) ?? null,
    category_name: (r.category_name as string) ?? null,
    category_header: (r.category_header as string) ?? null,
    display_order: N(r.display_order),
    item_id: (r.item_id as number) ?? null,
    item_name: (r.item_name as string) ?? null,
    unit_id: (r.unit_id as number) ?? null,
    unit_text: (r.unit_text as string) ?? null,
    quantity: N(r.quantity),
    taux_usd: N(r.taux_usd),
    cost_usd: N(r.cost_usd),
    currency_id: (r.currency_id as number) ?? null,
    has_tva: r.has_tva ? 1 : 0,
    tva_usd: N(r.tva_usd),
    subtotal_usd: N(r.subtotal_usd),
    total_usd: N(r.total_usd),
    cif_split: N(r.cif_split),
    percentage: N(r.percentage),
    rate_cdf: N(r.rate_cdf),
    vat_cdf: N(r.vat_cdf),
    total_cdf: N(r.total_cdf),
  }));
}

// ---------------------------------------------------------------------------
// GRID SAVE — replace children + recompute header totals in one transaction
// ---------------------------------------------------------------------------
export interface GridSaveResult {
  subtotal_usd: number;
  tva_usd: number;
  total_usd: number;
  total_weight: number;
}

// Recompute per-line subtotal/total from qty·taux and roll up the header.
function computeItem(it: GridSaveInput['items'][number]): GridItem {
  const subtotal = round2(N(it.quantity) * N(it.taux_usd));
  const tva = N(it.has_tva) ? round2(subtotal * 0.16) : 0; // DRC TVA 16% (basic)
  return {
    quotation_item_id: it.quotation_item_id,
    category_id: it.category_id,
    category_name: it.category_name ?? null,
    category_header: it.category_header ?? null,
    display_order: N(it.display_order),
    item_id: it.item_id,
    item_name: it.item_name ?? null,
    unit_id: it.unit_id,
    unit_text: it.unit_text ?? null,
    quantity: N(it.quantity),
    taux_usd: N(it.taux_usd),
    cost_usd: N(it.cost_usd),
    currency_id: it.currency_id,
    has_tva: N(it.has_tva),
    tva_usd: tva,
    subtotal_usd: subtotal,
    total_usd: round2(subtotal + tva),
    // The CDF side is entered, not multiplied out: main's category-1 row takes a
    // rate and a VAT and its total is their sum. The submitted total is ignored.
    cif_split: N(it.cif_split),
    percentage: N(it.percentage),
    rate_cdf: round2(N(it.rate_cdf)),
    vat_cdf: round2(N(it.vat_cdf)),
    total_cdf: round2(N(it.rate_cdf) + N(it.vat_cdf)),
  };
}

/** What the embedded grid field holds on the transaction page's form. */
export interface InvoiceGridValue {
  quotation_id: number | null;
  items: GridItem[];
  mcaDetails: GridMca[];
  /** Import only — the customs category shown ('S') or hidden ('H'). */
  first_categoty_edited?: 'H' | 'S';
}

/** The slug ↔ kind map, so neither side of the page hook guesses. */
export function invoiceKindForSlug(slug: string): InvoiceKind | null {
  if (slug === 'import-invoices') return 'import';
  if (slug === 'export-invoices') return 'export';
  return null;
}

/**
 * An invoice's children in the shape the form holds them.
 *
 * Loaded by the page's GET so the grid opens already populated — a grid that
 * fetched its own value would start empty, and a save in that instant would
 * read the operator's silence as "delete every line".
 */
export async function loadInvoiceGridValue(
  kind: InvoiceKind,
  invoiceId: number,
): Promise<InvoiceGridValue> {
  const data = await gridData(kind, invoiceId);
  if (!data) return { quotation_id: null, items: [], mcaDetails: [] };
  const rows = await db.execute(
    kind === 'export'
      ? sql`SELECT quotation_id, NULL::text AS first_categoty_edited FROM export_invoices_t WHERE id = ${invoiceId} LIMIT 1`
      : sql`SELECT quotation_id, first_categoty_edited FROM import_invoices_t WHERE id = ${invoiceId} LIMIT 1`,
  );
  const row = (rows as unknown as {
    rows: { quotation_id: number | null; first_categoty_edited: string | null }[];
  }).rows[0];
  return {
    quotation_id: row?.quotation_id ?? null,
    items: data.items,
    mcaDetails: data.mcaDetails,
    ...(kind === 'import'
      ? { first_categoty_edited: row?.first_categoty_edited === 'H' ? ('H' as const) : ('S' as const) }
      : {}),
  };
}

/**
 * The submitted grid value, coerced through the same schema the `/grid` route
 * parses. Untrusted input reaching a generic runtime gets the same treatment it
 * would through the dedicated endpoint — and every figure is recomputed by
 * `computeGrid` regardless of what was sent.
 */
export function parseInvoiceGridValue(value: unknown): GridSaveInput | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const parsed = gridSaveSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The header columns a grid determines, keyed by DB column name.
 *
 * Returned rather than written so the caller owns the UPDATE. The transaction
 * page needs them spliced into its own single UPDATE (§4.17) — a second
 * statement would either overwrite a header field the operator had just typed,
 * or leave the header carrying totals its stored lines do not add up to.
 */
export interface GridComputation {
  items: GridItem[];
  columns: Record<string, unknown>;
  result: GridSaveResult;
}

/**
 * Everything the grid decides, with no database access.
 *
 * Pure so it can run before the write — the page route needs the header columns
 * in hand while it is still building its patch. `weight` and the three
 * `calculated_*` totals are DERIVED: the operator types quantities and rates,
 * never a total, so a submitted value for any of them is ignored.
 */
export function computeGrid(kind: InvoiceKind, payload: GridSaveInput): GridComputation {
  const items = payload.items.map(computeItem);
  const subtotal = round2(items.reduce((s, it) => s + it.subtotal_usd, 0));
  const tva = round2(items.reduce((s, it) => s + it.tva_usd, 0));
  const total = round2(subtotal + tva);
  const weight = round2(payload.mcaDetails.reduce((s, m) => s + N(m.weight), 0));

  const mcaIds = payload.mcaDetails
    .map((m) => m.mca_id)
    .filter((v): v is number => Number.isInteger(v) && (v as number) > 0);

  const columns: Record<string, unknown> =
    kind === 'export'
      ? {
          quotation_id: payload.quotation_id ?? null,
          total_weight: String(weight),
          // main's total_duty_cdf: every file's five government charges, in CDF.
          total_duty_cdf: String(
            round2(
              payload.mcaDetails.reduce(
                (s, m) =>
                  s + N(m.ceec_amount) + N(m.cgea_amount) + N(m.occ_amount) + N(m.lmc_amount) + N(m.ogefrem_amount),
                0,
              ),
            ),
          ),
          quotation_sub_total: String(subtotal),
          quotation_vat_amount: String(tva),
          quotation_total_amount: String(total),
        }
      : {
          quotation_id: payload.quotation_id ?? null,
          // The selected MCAs are recorded as a CSV on the header, which is what
          // every reader of this table already expects; the first is the
          // primary `mca_id`, as main wrote it.
          mca_ids: mcaIds.join(',') || null,
          mca_id: mcaIds[0] ?? null,
          // `poids_kg` is NOT written here. It used to be — as the sum of the
          // MCA rows' weights — but an import MCA row carries no weight (the
          // file's weight is a header field, auto-filled from the files and
          // editable), so every save silently zeroed the weight the operator
          // had in front of them.
          //
          // main's calculated_* are the USD categories only; the customs
          // category is CDF and is carried in calculated_total_cdf, and only
          // while it is shown on the invoice.
          calculated_sub_total: String(subtotal),
          calculated_vat_amount: String(tva),
          calculated_total_amount: String(total),
          calculated_total_cdf: String(
            (payload.first_categoty_edited ?? 'S') === 'H'
              ? 0
              : round2(items.reduce((s, it) => s + it.total_cdf, 0)),
          ),
          ...(payload.first_categoty_edited
            ? { first_categoty_edited: payload.first_categoty_edited }
            : {}),
        };

  return {
    items,
    columns,
    result: { subtotal_usd: subtotal, tva_usd: tva, total_usd: total, total_weight: weight },
  };
}

/**
 * Replace the invoice's CHILD rows inside the caller's transaction.
 *
 * Header columns are deliberately NOT written here — see `computeGrid`. Split
 * apart so the transaction page can write children and header in one statement
 * each, both inside its own single transaction, while the standalone `/grid`
 * route keeps working unchanged through `saveGrid` below.
 */
export async function writeGridChildren(
  tx: Transaction,
  kind: InvoiceKind,
  invoiceId: number,
  items: GridItem[],
  payload: GridSaveInput,
  uid: number,
): Promise<void> {
  await writeChildren(tx, kind, invoiceId, items, payload, uid);
}

export async function saveGrid(
  kind: InvoiceKind,
  invoiceId: number,
  payload: GridSaveInput,
  uid: number,
): Promise<GridSaveResult> {
  const { items, columns, result } = computeGrid(kind, payload);

  await db.transaction(async (tx) => {
    await writeChildren(tx, kind, invoiceId, items, payload, uid);
    // The legacy route owns its own header UPDATE; the page route splices the
    // same columns into its patch instead.
    const sets = Object.entries(columns).map(
      ([col, value]) => sql`${sql.identifier(col)} = ${value}`,
    );
    sets.push(sql`updated_by = ${uid}`, sql`updated_at = now()`);
    const table = kind === 'export' ? sql`export_invoices_t` : sql`import_invoices_t`;
    await tx.execute(
      sql`UPDATE ${table} SET ${sql.join(sets, sql`, `)} WHERE id = ${invoiceId}`,
    );
  });

  return result;
}

/** main's Liquidation USD: the file's CDF liquidation at its own DGDA rate. */
export function liquidationUsd(m: { liquidation_amount?: unknown; bcc_rate?: unknown }): number {
  const rate = N(m.bcc_rate);
  return rate > 0 ? round2(N(m.liquidation_amount) / rate) : 0;
}

/** The child-table half, shared by both entry points above (§4.10). */
async function writeChildren(
  tx: Transaction,
  kind: InvoiceKind,
  invoiceId: number,
  items: GridItem[],
  payload: GridSaveInput,
  uid: number,
): Promise<void> {
  {
    if (kind === 'export') {
      await tx.delete(exportInvoiceItems).where(eq(exportInvoiceItems.exportInvoiceId, invoiceId));
      await tx.delete(exportInvoiceMcaDetails).where(eq(exportInvoiceMcaDetails.exportInvoiceId, invoiceId));
      if (items.length) {
        await tx.insert(exportInvoiceItems).values(
          items.map((it, i) => ({
            exportInvoiceId: invoiceId,
            quotationItemId: it.quotation_item_id,
            categoryId: it.category_id,
            categoryName: it.category_name,
            categoryHeader: it.category_header,
            displayOrder: it.display_order || i,
            itemId: it.item_id,
            itemName: it.item_name,
            unitId: it.unit_id,
            unitText: it.unit_text,
            quantity: String(it.quantity),
            tauxUsd: String(it.taux_usd),
            costUsd: String(it.cost_usd),
            currencyId: it.currency_id,
            hasTva: it.has_tva,
            tvaUsd: String(it.tva_usd),
            subtotalUsd: String(it.subtotal_usd),
            totalUsd: String(it.total_usd),
          })),
        );
      }
      if (payload.mcaDetails.length) {
        await tx.insert(exportInvoiceMcaDetails).values(
          payload.mcaDetails.map((m, i) => ({
            exportInvoiceId: invoiceId,
            mcaId: m.mca_id,
            displayOrder: m.display_order || i,
            lotNumber: m.lot_number,
            declarationNo: m.declaration_no,
            declarationDate: m.declaration_date || null,
            liquidationNo: m.liquidation_no,
            liquidationDate: m.liquidation_date || null,
            liquidationAmount: String(N(m.liquidation_amount)),
            // Recomputed, never trusted: main's Liquidation USD = CDF ÷ the
            // file's DGDA rate, and 0 while no rate is set.
            liquidationUsd: String(liquidationUsd(m)),
            bccRate: String(N(m.bcc_rate)),
            feetContainerId: m.feet_container_id ?? null,
            quittanceNo: m.quittance_no,
            quittanceDate: m.quittance_date || null,
            horse: m.horse,
            trailer1: m.trailer_1,
            trailer2: m.trailer_2,
            container: m.container,
            weight: String(N(m.weight)),
            buyer: m.buyer,
            ceecAmount: String(N(m.ceec_amount)),
            cgeaAmount: String(N(m.cgea_amount)),
            occAmount: String(N(m.occ_amount)),
            lmcAmount: String(N(m.lmc_amount)),
            ogefremAmount: String(N(m.ogefrem_amount)),
          })),
        );
      }
    } else {
      // Import: items in child table; selected MCAs recorded as a CSV on header.
      await tx
        .update(importInvoiceItems)
        .set({ display: 'N' })
        .where(eq(importInvoiceItems.invoiceId, invoiceId));
      if (items.length) {
        await tx.insert(importInvoiceItems).values(
          items.map((it, i) => ({
            invoiceId,
            quotationItemId: it.quotation_item_id,
            categoryId: it.category_id,
            categoryName: it.category_name,
            categoryHeader: it.category_header,
            itemId: it.item_id,
            itemName: it.item_name,
            unitId: it.unit_id,
            unitText: it.unit_text,
            quantity: String(it.quantity),
            tauxUsd: String(it.taux_usd),
            costUsd: String(it.cost_usd),
            currencyId: it.currency_id,
            hasTva: it.has_tva,
            tvaUsd: String(it.tva_usd),
            subtotalUsd: String(it.subtotal_usd),
            totalUsd: String(it.total_usd),
            cifSplit: String(it.cif_split),
            percentage: String(it.percentage),
            rateCdf: String(it.rate_cdf),
            vatCdf: String(it.vat_cdf),
            totalCdf: String(it.total_cdf),
            sortOrder: it.display_order || i,
            createdBy: uid,
          })),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// VALIDATE / DELETE
// ---------------------------------------------------------------------------
export async function setValidated(kind: InvoiceKind, invoiceId: number, validated: number, uid: number): Promise<void> {
  const t = kind === 'export' ? exportInvoices : importInvoices;
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ validated: t.validated, invoiceRef: t.invoiceRef, createdBy: t.createdBy })
      .from(t)
      .where(eq(t.id, invoiceId));
    await tx.update(t).set({ validated, updatedBy: uid, updatedAt: new Date() }).where(eq(t.id, invoiceId));
    await recordAudit(tx, {
      actorId: uid,
      action: 'status_change',
      entityType: `${kind}_invoice`,
      entityId: invoiceId,
      before: { validated: before?.validated ?? null },
      after: { validated },
    });
    await announceInvoiceStatus(tx, kind, invoiceId, before?.validated ?? 0, validated, uid);
  });
}

/**
 * Tell the configured roles an invoice moved forward — validated (1) or
 * DGI-verified (2). A step back (un-validating) is not announced. Shared by the
 * Validate action and the DGI edit, which promotes a complete invoice to 2.
 */
export async function announceInvoiceStatus(
  tx: Transaction,
  kind: InvoiceKind,
  invoiceId: number,
  from: number,
  to: number,
  uid: number,
): Promise<void> {
  if (to <= from || (to !== 1 && to !== 2)) return;
  const t = kind === 'export' ? exportInvoices : importInvoices;
  const [row] = await tx
    .select({ invoiceRef: t.invoiceRef, createdBy: t.createdBy })
    .from(t)
    .where(eq(t.id, invoiceId));
  await raiseEvent(tx, `${kind}_invoice.${to === 2 ? 'dgi_verified' : 'validated'}`, {
    actorUserId: uid,
    creatorUserId: row?.createdBy ?? null,
    context: { ref: row?.invoiceRef ?? `#${invoiceId}`, kind: kind === 'export' ? 'Export' : 'Import' },
  });
}

export async function softDeleteInvoice(kind: InvoiceKind, invoiceId: number, uid: number): Promise<void> {
  const t = kind === 'export' ? exportInvoices : importInvoices;
  await db.update(t).set({ display: 'N', updatedBy: uid, updatedAt: new Date() }).where(eq(t.id, invoiceId));
}

// ---------------------------------------------------------------------------
// row mappers (numeric columns come back as strings from Drizzle)
// ---------------------------------------------------------------------------
type ExportItemRow = typeof exportInvoiceItems.$inferSelect;
type ExportMcaRow = typeof exportInvoiceMcaDetails.$inferSelect;
type ImportItemRow = typeof importInvoiceItems.$inferSelect;

function mapExportItem(r: ExportItemRow): GridItem {
  return {
    id: r.id,
    quotation_item_id: r.quotationItemId,
    category_id: r.categoryId,
    category_name: r.categoryName,
    category_header: r.categoryHeader,
    display_order: N(r.displayOrder),
    item_id: r.itemId,
    item_name: r.itemName,
    unit_id: r.unitId,
    unit_text: r.unitText,
    quantity: N(r.quantity),
    taux_usd: N(r.tauxUsd),
    cost_usd: N(r.costUsd),
    currency_id: r.currencyId,
    has_tva: N(r.hasTva),
    tva_usd: N(r.tvaUsd),
    subtotal_usd: N(r.subtotalUsd),
    total_usd: N(r.totalUsd),
    // An export line is USD throughout; its table has no CDF columns.
    cif_split: 0,
    percentage: 0,
    rate_cdf: 0,
    vat_cdf: 0,
    total_cdf: 0,
  };
}

function mapImportItem(r: ImportItemRow): GridItem {
  return {
    id: r.id,
    quotation_item_id: r.quotationItemId,
    category_id: r.categoryId,
    category_name: r.categoryName,
    category_header: r.categoryHeader,
    display_order: N(r.sortOrder),
    item_id: r.itemId,
    item_name: r.itemName,
    unit_id: r.unitId,
    unit_text: r.unitText,
    quantity: N(r.quantity),
    taux_usd: N(r.tauxUsd),
    cost_usd: N(r.costUsd),
    currency_id: r.currencyId,
    has_tva: N(r.hasTva),
    tva_usd: N(r.tvaUsd),
    subtotal_usd: N(r.subtotalUsd),
    total_usd: N(r.totalUsd),
    cif_split: N(r.cifSplit),
    percentage: N(r.percentage),
    rate_cdf: N(r.rateCdf),
    vat_cdf: N(r.vatCdf),
    total_cdf: N(r.totalCdf),
  };
}

function mapExportMca(r: ExportMcaRow): GridMca {
  return {
    id: r.id,
    mca_id: r.mcaId,
    display_order: N(r.displayOrder),
    lot_number: r.lotNumber,
    declaration_no: r.declarationNo,
    declaration_date: r.declarationDate,
    liquidation_no: r.liquidationNo,
    liquidation_date: r.liquidationDate,
    liquidation_amount: N(r.liquidationAmount),
    liquidation_usd: N(r.liquidationUsd),
    quittance_no: r.quittanceNo,
    quittance_date: r.quittanceDate,
    horse: r.horse,
    trailer_1: r.trailer1,
    trailer_2: r.trailer2,
    container: r.container,
    weight: N(r.weight),
    buyer: r.buyer,
    bcc_rate: N(r.bccRate),
    feet_container_id: r.feetContainerId,
    ceec_amount: N(r.ceecAmount),
    cgea_amount: N(r.cgeaAmount),
    occ_amount: N(r.occAmount),
    lmc_amount: N(r.lmcAmount),
    ogefrem_amount: N(r.ogefremAmount),
  };
}

function emptyMca(mcaId: number): GridMca {
  return {
    mca_id: mcaId,
    display_order: 0,
    lot_number: null,
    declaration_no: null,
    declaration_date: null,
    liquidation_no: null,
    liquidation_date: null,
    liquidation_amount: 0,
    liquidation_usd: 0,
    quittance_no: null,
    quittance_date: null,
    horse: null,
    trailer_1: null,
    trailer_2: null,
    container: null,
    weight: 0,
    buyer: null,
    bcc_rate: 0,
    feet_container_id: null,
    ceec_amount: 0,
    cgea_amount: 0,
    occ_amount: 0,
    lmc_amount: 0,
    ogefrem_amount: 0,
  };
}

// exported for callers that need to look up a single MCA's prefill columns
export async function exportMcaPrefill(mcaId: number): Promise<Partial<GridMca> | null> {
  const rows = await db.execute(sql`
    SELECT mca_ref, buyer, lot_number, weight,
           declaration_reference AS declaration_no, to_char(dgda_in_date,'YYYY-MM-DD') AS declaration_date,
           liquidation_reference AS liquidation_no, to_char(liquidation_date,'YYYY-MM-DD') AS liquidation_date,
           liquidation_amount, quittance_reference AS quittance_no, to_char(quittance_date,'YYYY-MM-DD') AS quittance_date,
           horse, trailer_1, trailer_2, container, feet_container,
           ceec_amount, cgea_amount, occ_amount, lmc_amount, ogefrem_amount
    FROM exports_t WHERE id = ${mcaId} LIMIT 1`);
  const r = (rows as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!r) return null;
  return {
    mca_id: mcaId,
    lot_number: (r.lot_number as string) ?? null,
    declaration_no: (r.declaration_no as string) ?? null,
    declaration_date: (r.declaration_date as string) ?? null,
    liquidation_no: (r.liquidation_no as string) ?? null,
    liquidation_date: (r.liquidation_date as string) ?? null,
    liquidation_amount: N(r.liquidation_amount),
    quittance_no: (r.quittance_no as string) ?? null,
    quittance_date: (r.quittance_date as string) ?? null,
    horse: (r.horse as string) ?? null,
    trailer_1: (r.trailer_1 as string) ?? null,
    trailer_2: (r.trailer_2 as string) ?? null,
    container: (r.container as string) ?? null,
    weight: N(r.weight),
    buyer: (r.buyer as string) ?? null,
    feet_container_id: r.feet_container == null ? null : N(r.feet_container),
    ceec_amount: N(r.ceec_amount),
    cgea_amount: N(r.cgea_amount),
    occ_amount: N(r.occ_amount),
    lmc_amount: N(r.lmc_amount),
    ogefrem_amount: N(r.ogefrem_amount),
  };
}

// ---------------------------------------------------------------------------
// HEADER FROM FILES — what the selected MCA files say the invoice header is
// ---------------------------------------------------------------------------

/**
 * The header an invoice takes from the files on it, plus the quotation it
 * prices against.
 *
 * `patch` is keyed by the header's DB column names — the same names the form's
 * fields carry — so the grid can hand it straight to the form. Only columns the
 * files actually determine appear; a key the files say nothing about is absent,
 * never blanked, so an operator's own entry is not wiped by picking a file.
 */
export interface McaHeaderPatch {
  patch: Record<string, string | number | null>;
  /** The quotation main would auto-select, or null when it would not pick one. */
  quotation_id: number | null;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === '' ? null : String(v);

export async function mcaHeaderPatch(
  kind: InvoiceKind,
  clientId: number | null,
  mcaIds: number[],
): Promise<McaHeaderPatch> {
  const ids = mcaIds.filter((n) => Number.isInteger(n) && n > 0);
  if (!clientId || ids.length === 0) return { patch: {}, quotation_id: null };

  if (kind === 'export') {
    // main fills the header from the FIRST file selected: kind, goods and
    // transport, which also decide the quotation and the reference suffix.
    const rows = await db.execute(sql`
      SELECT e.kind, e.type_of_goods, e.transport_mode, l.kind_id AS license_kind
      FROM exports_t e
      LEFT JOIN license_t l ON l.id = e.license_id
      WHERE e.id = ${ids[0]} LIMIT 1`);
    const r = (rows as unknown as { rows: Record<string, unknown>[] }).rows[0];
    if (!r) return { patch: {}, quotation_id: null };
    const kindId = r.kind == null ? (r.license_kind == null ? null : N(r.license_kind)) : N(r.kind);
    const goodsId = r.type_of_goods == null ? null : N(r.type_of_goods);
    const transportId = r.transport_mode == null ? null : N(r.transport_mode);
    const patch: McaHeaderPatch['patch'] = {};
    if (kindId) patch.kind_id = kindId;
    if (goodsId) patch.goods_type_id = goodsId;
    if (transportId) patch.transport_mode_id = transportId;
    return {
      patch,
      quotation_id: await matchQuotation(clientId, kindId, goodsId, transportId, 'fallback'),
    };
  }

  // Import: main's mergeMCAData — the first file's scalars, the files' sums.
  const rows = await db.execute(sql`
    SELECT i.id, i.fob, i.fret, i.weight, i.m3, i.liquidation_amount,
           COALESCE(l.kind_id, i.kind) AS kind_id,
           COALESCE(l.type_of_goods_id, i.type_of_goods) AS goods_type_id,
           -- The file's own mode first (a licence can be cleared by road one
           -- trip and rail the next), the licence's when the file has none —
           -- kind and goods already fall back the same way, and a blank
           -- Transport Mode on a filed invoice was the result of not doing so.
           COALESCE(i.transport_mode, l.transport_mode_id) AS transport_mode_id,
           i.horse, i.trailer_1, i.trailer_2, i.container, i.wagon,
           i.airway_bill, i.airway_bill_weight,
           i.invoice AS facture_pfi_no, i.po_ref, i.inspection_reports AS bivac_inspection,
           i.declaration_reference AS declaration_no,
           to_char(i.dgda_in_date, 'YYYY-MM-DD') AS declaration_date,
           i.liquidation_reference AS liquidation_no,
           to_char(i.liquidation_date, 'YYYY-MM-DD') AS liquidation_date,
           i.quittance_reference AS quittance_no,
           to_char(i.quittance_date, 'YYYY-MM-DD') AS quittance_date,
           to_char(i.dgda_out_date, 'YYYY-MM-DD') AS dispatch_deliver_date,
           cm.commodity_name
    FROM imports_t i
    LEFT JOIN license_t l ON l.id = i.license_id
    LEFT JOIN commodity_master_t cm ON cm.id = i.commodity
    WHERE i.id IN (${sql.join(ids.map((n) => sql`${n}`), sql`, `)})
    ORDER BY i.id DESC`);
  const list = (rows as unknown as { rows: Record<string, unknown>[] }).rows;
  if (list.length === 0) return { patch: {}, quotation_id: null };
  const first = list[0];

  const [client] = (
    (await db.execute(sql`SELECT liquidation_paid_by FROM client_master_t WHERE id = ${clientId}`)) as unknown as {
      rows: { liquidation_paid_by: unknown }[];
    }
  ).rows;
  const sum = (key: string): number => round2(list.reduce((s, r) => s + N(r[key]), 0));
  const commodities = [...new Set(list.map((r) => str(r.commodity_name)).filter((v): v is string => !!v))];

  const kindId = first.kind_id == null ? null : N(first.kind_id);
  const goodsId = first.goods_type_id == null ? null : N(first.goods_type_id);
  const transportId = first.transport_mode_id == null ? null : N(first.transport_mode_id);

  const patch: McaHeaderPatch['patch'] = {
    kind_id: kindId,
    goods_type_id: goodsId,
    transport_mode_id: transportId,
    fob_usd: sum('fob'),
    fret_usd: sum('fret'),
    poids_kg: sum('weight'),
    produit: commodities.join(', ') || null,
    // main leaves the duty blank when the CLIENT pays the liquidation itself
    // (liquidation_paid_by 1): there is nothing for the agency to bill.
    total_duty_cdf: N(client?.liquidation_paid_by) === 1 ? null : sum('liquidation_amount'),
    // Fuel (goods type 3) is billed per M3; main only fills it for that type.
    m3: goodsId === 3 ? sum('m3') : null,
    facture_pfi_no: str(first.facture_pfi_no),
    po_ref: str(first.po_ref),
    bivac_inspection: str(first.bivac_inspection),
    declaration_no: str(first.declaration_no),
    declaration_date: str(first.declaration_date),
    liquidation_no: str(first.liquidation_no),
    liquidation_date: str(first.liquidation_date),
    quittance_no: str(first.quittance_no),
    quittance_date: str(first.quittance_date),
    dispatch_deliver_date: str(first.dispatch_deliver_date),
    horse: str(first.horse),
    trailer_1: str(first.trailer_1),
    trailer_2: str(first.trailer_2),
    container: str(first.container),
    wagon: str(first.wagon),
    airway_bill: str(first.airway_bill),
    airway_bill_weight: first.airway_bill_weight == null ? null : N(first.airway_bill_weight),
  };

  const quotationId = await matchQuotation(clientId, kindId, goodsId, transportId, 'exact');
  if (quotationId) {
    const [q] = (
      (await db.execute(sql`SELECT arsp FROM quotations_t WHERE id = ${quotationId}`)) as unknown as {
        rows: { arsp: string | null }[];
      }
    ).rows;
    if (q?.arsp) patch.arsp = q.arsp;
  }
  return { patch, quotation_id: quotationId };
}

/**
 * The quotation an invoice prices against, as main chose it.
 *
 *   exact    — Import: the client's quotations for this kind, transport AND
 *              goods; picked only when exactly one matches, otherwise left for
 *              the operator (main listed the matches and auto-selected a lone
 *              one).
 *   fallback — Export: kind + goods + transport, then kind + transport, then
 *              kind alone, then the client's most recent — main's
 *              autoMatchQuotation, which always lands on something.
 */
export async function matchQuotation(
  clientId: number,
  kindId: number | null,
  goodsId: number | null,
  transportId: number | null,
  mode: 'exact' | 'fallback',
): Promise<number | null> {
  const rows = (
    (await db.execute(sql`
      SELECT id, kind_id, goods_type_id, transport_mode_id
      FROM quotations_t
      WHERE client_id = ${clientId} AND display = 'Y'
      ORDER BY quotation_date DESC NULLS LAST, id DESC`)) as unknown as {
      rows: { id: number; kind_id: number | null; goods_type_id: number | null; transport_mode_id: number | null }[];
    }
  ).rows;
  const same = (a: number | null, b: number | null) => a != null && b != null && N(a) === N(b);
  const full = rows.filter(
    (q) => same(q.kind_id, kindId) && same(q.goods_type_id, goodsId) && same(q.transport_mode_id, transportId),
  );
  if (mode === 'exact') return full.length === 1 ? full[0].id : null;
  return (
    full[0]?.id ??
    rows.find((q) => same(q.kind_id, kindId) && same(q.transport_mode_id, transportId))?.id ??
    rows.find((q) => same(q.kind_id, kindId))?.id ??
    rows[0]?.id ??
    null
  );
}

/**
 * The licences an import invoice covers, from its files — main's `license_ids`
 * CSV and the primary `license_id`. main made the operator tick licences before
 * files; every file belongs to exactly one licence, so the set is determined by
 * the files and is recorded rather than asked for twice.
 */
export async function importLicenseColumns(mcaIds: number[]): Promise<Record<string, unknown>> {
  const ids = mcaIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { license_ids: null, license_id: null };
  const rows = (
    (await db.execute(sql`
      SELECT DISTINCT license_id FROM imports_t
      WHERE id IN (${sql.join(ids.map((n) => sql`${n}`), sql`, `)}) AND license_id IS NOT NULL
      ORDER BY license_id`)) as unknown as { rows: { license_id: number }[] }
  ).rows;
  const licenceIds = rows.map((r) => N(r.license_id));
  return { license_ids: licenceIds.join(',') || null, license_id: licenceIds[0] ?? null };
}
