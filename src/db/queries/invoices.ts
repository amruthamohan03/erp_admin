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
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { GridSaveInput } from '@/schemas/invoiceGrid';
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
  availableMcas: { id: number; mca_ref: string | null; label: string }[];
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
    const mcas = await availableExportMcas(inv.client_id);

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
  const mcas = await availableImportMcas(inv.client_id);

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

async function clientQuotations(
  clientId: number | null,
): Promise<{ id: number; quotation_ref: string; quotation_date: string | null }[]> {
  if (!clientId) return [];
  const rows = await db.execute(sql`
    SELECT id, quotation_ref, to_char(quotation_date, 'YYYY-MM-DD') AS quotation_date
    FROM quotations_t WHERE client_id = ${clientId} AND display = 'Y' ORDER BY id DESC LIMIT 200`);
  return (rows as unknown as { rows: { id: number; quotation_ref: string; quotation_date: string | null }[] }).rows;
}

async function availableExportMcas(
  clientId: number | null,
): Promise<{ id: number; mca_ref: string | null; label: string }[]> {
  if (!clientId) return [];
  const rows = await db.execute(sql`
    SELECT id, mca_ref, buyer, invoice FROM exports_t
    WHERE client_id = ${clientId} AND display = 'Y' AND mca_ref IS NOT NULL AND mca_ref <> ''
    ORDER BY id DESC LIMIT 500`);
  return (rows as unknown as { rows: { id: number; mca_ref: string | null; buyer: string | null; invoice: string | null }[] }).rows.map(
    (r) => ({ id: r.id, mca_ref: r.mca_ref, label: `${r.mca_ref ?? r.id}${r.buyer ? ` — ${r.buyer}` : ''}` }),
  );
}

async function availableImportMcas(
  clientId: number | null,
): Promise<{ id: number; mca_ref: string | null; label: string }[]> {
  if (!clientId) return [];
  const rows = await db.execute(sql`
    SELECT id, mca_ref, supplier, invoice FROM imports_t
    WHERE client_id = ${clientId} AND display = 'Y' AND mca_ref IS NOT NULL AND mca_ref <> ''
    ORDER BY id DESC LIMIT 500`);
  return (rows as unknown as { rows: { id: number; mca_ref: string | null; supplier: string | null }[] }).rows.map(
    (r) => ({ id: r.id, mca_ref: r.mca_ref, label: `${r.mca_ref ?? r.id}${r.supplier ? ` — ${r.supplier}` : ''}` }),
  );
}

// ---------------------------------------------------------------------------
// QUOTATION ITEMS — load a quotation's items into the grid (grouped by category)
// ---------------------------------------------------------------------------
export async function quotationItemsForGrid(quotationId: number): Promise<GridItem[]> {
  const rows = await db.execute(sql`
    SELECT qi.id AS quotation_item_id, qi.category_id, qi.item_id, qi.unit_id, qi.unit_text,
           qi.quantity, qi.taux_usd, qi.cost_usd, qi.currency_id, qi.has_tva, qi.tva_usd,
           qi.subtotal_usd, qi.total_usd,
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
  };
}

export async function saveGrid(
  kind: InvoiceKind,
  invoiceId: number,
  payload: GridSaveInput,
  uid: number,
): Promise<GridSaveResult> {
  const items = payload.items.map(computeItem);
  const subtotal = round2(items.reduce((s, it) => s + it.subtotal_usd, 0));
  const tva = round2(items.reduce((s, it) => s + it.tva_usd, 0));
  const total = round2(subtotal + tva);
  const weight = round2(payload.mcaDetails.reduce((s, m) => s + N(m.weight), 0));

  await db.transaction(async (tx) => {
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
            liquidationUsd: String(N(m.liquidation_usd)),
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
      await tx
        .update(exportInvoices)
        .set({
          quotationId: payload.quotation_id ?? null,
          fobUsd: String(total),
          totalWeight: String(weight),
          updatedBy: uid,
          updatedAt: new Date(),
        })
        .where(eq(exportInvoices.id, invoiceId));
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
            sortOrder: it.display_order || i,
            createdBy: uid,
          })),
        );
      }
      const mcaIds = payload.mcaDetails
        .map((m) => m.mca_id)
        .filter((v): v is number => Number.isInteger(v) && (v as number) > 0)
        .join(',');
      await tx
        .update(importInvoices)
        .set({
          quotationId: payload.quotation_id ?? null,
          mcaIds: mcaIds || null,
          poidsKg: String(weight),
          calculatedSubTotal: String(subtotal),
          calculatedVatAmount: String(tva),
          calculatedTotalAmount: String(total),
          updatedBy: uid,
          updatedAt: new Date(),
        })
        .where(eq(importInvoices.id, invoiceId));
    }
  });

  return { subtotal_usd: subtotal, tva_usd: tva, total_usd: total, total_weight: weight };
}

// ---------------------------------------------------------------------------
// VALIDATE / DELETE
// ---------------------------------------------------------------------------
export async function setValidated(kind: InvoiceKind, invoiceId: number, validated: number, uid: number): Promise<void> {
  const t = kind === 'export' ? exportInvoices : importInvoices;
  await db.update(t).set({ validated, updatedBy: uid, updatedAt: new Date() }).where(eq(t.id, invoiceId));
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
           horse, trailer_1, trailer_2, container,
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
    ceec_amount: N(r.ceec_amount),
    cgea_amount: N(r.cgea_amount),
    occ_amount: N(r.occ_amount),
    lmc_amount: N(r.lmc_amount),
    ogefrem_amount: N(r.ogefrem_amount),
  };
}
