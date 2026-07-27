// §2 step 5 — Import invoice Excel exports (Debit Note / Invoice / Full).
// Ports the legacy exportDebit/exportInvoiced/exportFull: one row per MCA file,
// amounts bucketed by item category and split evenly across the invoice's MCAs.
//   cat 1 = reimbursable/liquidation (CDF)   cat 2 = other charges
//   cat 3 = operational costs                cat 4 = agency fee
// The three profiles differ only in which invoices they include and which
// buckets they surface; everything else is shared here (main duplicated it 3×).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildXlsx, type XlsxColumn } from '@/lib/xlsx';

export type ExportProfile = 'debit' | 'invoice' | 'full';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number): number => Math.round(n * 100) / 100;
const d = (v: unknown): string => {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, day] = s.split('-');
  return y && m && day ? `${day}/${m}/${y}` : s;
};

// Compress consecutive MCA refs sharing a prefix into "A0001 to A0003".
function formatMcaRange(refs: string[]): string {
  const clean = refs.filter(Boolean);
  if (clean.length <= 1) return clean.join(', ');
  const parsed = clean.map((ref) => {
    const m = /^(.*?)(\d+)$/.exec(ref.trim());
    return m ? { prefix: m[1], numv: parseInt(m[2], 10), ref: ref.trim() } : null;
  });
  if (parsed.some((p) => p === null)) return clean.join(', ');
  const rows = parsed as { prefix: string; numv: number; ref: string }[];
  if (new Set(rows.map((p) => p.prefix)).size !== 1) return rows.map((p) => p.ref).join(', ');
  rows.sort((a, b) => a.numv - b.numv);
  const groups: [typeof rows[0], typeof rows[0]][] = [];
  let start = rows[0];
  let end = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].numv === end.numv + 1) end = rows[i];
    else {
      groups.push([start, end]);
      start = rows[i];
      end = rows[i];
    }
  }
  groups.push([start, end]);
  return groups.map(([a, b]) => (a.ref === b.ref ? a.ref : `${a.ref} to ${b.ref}`)).join(', ');
}

interface ItemRow {
  category_id: number;
  item_name: string;
  quantity: number;
  total_usd: number;
  tva_usd: number;
  rate_cdf: number;
  vat_cdf: number;
}

interface McaRow {
  mca_ref: string;
  fob: number;
  weight: number;
  declaration_reference: string | null;
  dgda_in_date: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  commodity_name: string | null;
}

const COLUMNS: XlsxColumn[] = [
  { key: 'n', header: '#', width: 5 },
  { key: 'mca_ref', header: 'Notre N° Ref #', width: 18 },
  { key: 'dgi_code', header: 'DGI Code', width: 16 },
  { key: 'dgi_amount', header: 'DGI Amount', width: 12 },
  { key: 'normalized_by', header: 'Normalized By', width: 16 },
  { key: 'client', header: 'Client', width: 20 },
  { key: 'encoded_by', header: 'Encoded By', width: 16 },
  { key: 'product_category', header: 'Product Category', width: 16 },
  { key: 'commodity', header: 'Commodity', width: 16 },
  { key: 'tariff_code', header: 'Tarif Code', width: 14 },
  { key: 'poids', header: 'Poids', width: 10 },
  { key: 'fob', header: 'FOB (USD)', width: 12 },
  { key: 'kind', header: 'Kind', width: 12 },
  { key: 'transport_mode', header: 'Transport Mode', width: 14 },
  { key: 'payment_method', header: 'Payment Method', width: 14 },
  { key: 'scelle_qty', header: 'Scelle Electr.', width: 10 },
  { key: 'scelle_amount', header: 'Scelle Amount', width: 12 },
  { key: 'frais_tresco', header: 'Frais Tresco', width: 12 },
  { key: 'decl_ref', header: 'Declaration Ref.', width: 14 },
  { key: 'decl_date', header: 'Declaration Date', width: 12 },
  { key: 'liq_ref', header: 'Liquidation Ref.', width: 14 },
  { key: 'liq_date', header: 'Liquidation Date', width: 12 },
  { key: 'quit_ref', header: 'Quittance Ref.', width: 14 },
  { key: 'quit_date', header: 'Quittance Date', width: 12 },
  { key: 'facture_no', header: 'FACTURE N°', width: 16 },
  { key: 'inv_date', header: 'INV. DATE', width: 12 },
  { key: 'dossiers', header: 'Dossiers', width: 20 },
  { key: 'po_ref', header: 'PO REF #', width: 14 },
  { key: 'liq_amt_cdf', header: 'LIQ AMT CDF', width: 14 },
  { key: 'rate_bcc', header: 'Rate(CDF/USD) BCC', width: 14 },
  { key: 'liq_amt_usd', header: 'LIQ AMT/USD', width: 12 },
  { key: 'other_charges', header: 'Other Charges', width: 12 },
  { key: 'other_tva', header: 'TVA/USD', width: 10 },
  { key: 'other_total', header: 'Total', width: 12 },
  { key: 'frais_bancaires', header: 'Frais Bancaires', width: 12 },
  { key: 'fb_tva', header: 'TVA/USD', width: 10 },
  { key: 'operational', header: 'Operational Costs', width: 12 },
  { key: 'op_tva', header: 'TVA/USD', width: 10 },
  { key: 'op_total', header: 'Total', width: 12 },
  { key: 'agency', header: 'Agency fee', width: 12 },
  { key: 'agency_tva', header: 'TVA/USD', width: 10 },
  { key: 'agency_total', header: 'Total', width: 12 },
  { key: 'total_invoice', header: 'Total Invoice', width: 14 },
  { key: 'status', header: 'Status', width: 16 },
];

function statusText(profile: ExportProfile, validated: number): string {
  if (profile === 'invoice') return validated === 2 ? 'DGI Verified' : 'Awaiting to send';
  return validated === 0 ? 'Pending Validation' : validated === 1 ? 'Validated' : 'DGI Verified';
}

export async function buildImportInvoiceExport(
  profile: ExportProfile,
  opts: { dateFrom?: string; dateTo?: string },
): Promise<Buffer> {
  const conds = [sql`inv.display = 'Y'`];
  if (profile === 'invoice') conds.push(sql`inv.validated IN (1, 2)`);
  if (opts.dateFrom) conds.push(sql`inv.created_at::date >= ${opts.dateFrom}`);
  if (opts.dateTo) conds.push(sql`inv.created_at::date <= ${opts.dateTo}`);

  const invRes = await db.execute(sql`
    SELECT inv.id, inv.invoice_ref, inv.mca_ids, inv.client_id, inv.goods_type_id,
           inv.tally_ref, inv.dgi_amount, inv.tariff_code_client, inv.poids_kg, inv.fob_usd,
           inv.po_ref, inv.total_duty_cdf, inv.rate_cdf_usd_bcc, inv.validated,
           inv.created_at, inv.payment_method,
           c.short_name AS client_name, u.username AS created_by_name, un.full_name AS normalizer_name,
           tg.goods_type AS product_category, k.kind_name, tm.transport_mode_name
    FROM import_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN users_t u ON u.id = inv.created_by
    LEFT JOIN users_t un ON un.id = inv.normalized_by
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN kind_master_t k ON k.id = inv.kind_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = inv.transport_mode_id
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY inv.id DESC`);
  const invoices = (invRes as unknown as { rows: Record<string, unknown>[] }).rows;

  const rows: Record<string, unknown>[] = [];
  let serial = 1;

  for (const inv of invoices) {
    const clientId = num(inv.client_id);
    const goodsTypeId = num(inv.goods_type_id);
    const isClient5or33 = clientId === 5 || clientId === 33;

    const itemsRes = await db.execute(sql`
      SELECT category_id, item_name, quantity, total_usd, tva_usd, rate_cdf, vat_cdf
      FROM import_invoice_items_t WHERE invoice_id = ${inv.id} AND display = 'Y'`);
    const items = (itemsRes as unknown as { rows: Record<string, unknown>[] }).rows.map(
      (r): ItemRow => ({
        category_id: num(r.category_id),
        item_name: String(r.item_name ?? ''),
        quantity: num(r.quantity),
        total_usd: num(r.total_usd),
        tva_usd: num(r.tva_usd),
        rate_cdf: num(r.rate_cdf),
        vat_cdf: num(r.vat_cdf),
      }),
    );

    let scelleQty = 0, scelleAmount = 0, fraisTresco = 0;
    let otherCharges = 0, otherChargesTva = 0, fraisBancaires = 0, fraisBancairesTva = 0;
    let operational = 0, operationalTva = 0, agency = 0, agencyTva = 0;
    let bivacIR = 0, bivacIRTva = 0;

    for (const it of items) {
      const name = it.item_name.toUpperCase();
      const sub = it.total_usd - it.tva_usd;
      if (name.trim() === 'FRAIS BANCAIRES' && isClient5or33) continue; // clients 5/33 skip
      if (name.trim() === 'FRAIS BANCAIRES') {
        fraisBancaires += sub;
        fraisBancairesTva += it.tva_usd;
      }
      if (it.category_id === 1 || it.category_id === 2) {
        if (name.includes('SCELLE') || name.includes('SEAL')) {
          scelleQty = it.quantity;
          scelleAmount += sub;
        }
        if (name.includes('TRESCO') || name.includes('ENTREPOSAGE')) fraisTresco += sub;
      }
      if (it.category_id === 2) {
        otherCharges += sub;
        otherChargesTva += it.tva_usd;
      }
      if (it.category_id === 3) {
        operational += sub;
        operationalTva += it.tva_usd;
      }
      if (it.category_id === 4) {
        agency += sub;
        agencyTva += it.tva_usd;
      }
      if (it.category_id === 1 && clientId === 49 && (goodsTypeId === 1 || goodsTypeId === 2) && (name.includes('BIVAC IR') || name.includes('BIVAC I.R'))) {
        bivacIR += it.rate_cdf;
        bivacIRTva += it.vat_cdf;
      }
    }

    const otherTotal = otherCharges + otherChargesTva;
    const opTotal = operational + operationalTva;
    const agencyTotal = agency + agencyTva;
    const liqAmtCdf = num(inv.total_duty_cdf);
    const rateCdf = num(inv.rate_cdf_usd_bcc) || 2500;
    const liqAmtUsd = rateCdf > 0 ? r2(liqAmtCdf / rateCdf) : 0;
    const validated = num(inv.validated);

    const mcaIds = String(inv.mca_ids ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    let mcas: McaRow[] = [];
    if (mcaIds.length) {
      const mcaRes = await db.execute(sql`
        SELECT i.mca_ref, i.fob, i.weight, i.declaration_reference,
               to_char(i.dgda_in_date, 'YYYY-MM-DD') AS dgda_in_date,
               i.liquidation_reference, to_char(i.liquidation_date, 'YYYY-MM-DD') AS liquidation_date,
               i.quittance_reference, to_char(i.quittance_date, 'YYYY-MM-DD') AS quittance_date,
               cm.commodity_name
        FROM imports_t i LEFT JOIN commodity_master_t cm ON cm.id = i.commodity
        WHERE i.id IN (${sql.join(mcaIds.map((x) => sql`${x}`), sql`, `)}) ORDER BY i.id ASC`);
      mcas = (mcaRes as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
        mca_ref: String(r.mca_ref ?? ''),
        fob: num(r.fob),
        weight: num(r.weight),
        declaration_reference: (r.declaration_reference as string) ?? null,
        dgda_in_date: (r.dgda_in_date as string) ?? null,
        liquidation_reference: (r.liquidation_reference as string) ?? null,
        liquidation_date: (r.liquidation_date as string) ?? null,
        quittance_reference: (r.quittance_reference as string) ?? null,
        quittance_date: (r.quittance_date as string) ?? null,
        commodity_name: (r.commodity_name as string) ?? null,
      }));
    }

    const cnt = mcas.length || 1;
    const dossiers = formatMcaRange(mcas.map((m) => m.mca_ref));
    const factureNo = (profile === 'debit' ? 'ND-' : '') + String(inv.invoice_ref ?? '');
    const invDate = d(inv.created_at);

    const emitRow = (mca: McaRow | null): void => {
      const showLiq = profile !== 'invoice';
      const showOpsAgency = profile !== 'debit';
      const liqUsdPer = r2(liqAmtUsd / cnt);
      const otherTotalPer = r2(otherTotal / cnt);
      const opTotalPer = r2(opTotal / cnt);
      const agencyTotalPer = r2(agencyTotal / cnt);
      const bivacPer = r2((bivacIR + bivacIRTva) / cnt);

      let totalInvoice = 0;
      if (profile === 'debit') totalInvoice = r2(liqUsdPer + otherTotalPer + bivacPer);
      else if (profile === 'invoice') totalInvoice = r2(opTotalPer + agencyTotalPer);
      else totalInvoice = r2(liqUsdPer + otherTotalPer + opTotalPer + agencyTotalPer + bivacPer);

      rows.push({
        n: serial++,
        mca_ref: mca?.mca_ref ?? '',
        dgi_code: inv.tally_ref ?? '',
        dgi_amount: r2(num(inv.dgi_amount) / cnt),
        normalized_by: inv.normalizer_name ?? '',
        client: inv.client_name ?? '',
        encoded_by: inv.created_by_name ?? '',
        product_category: inv.product_category ?? '',
        commodity: mca?.commodity_name ?? '',
        tariff_code: inv.tariff_code_client ?? '',
        poids: mca ? r2(mca.weight) : r2(num(inv.poids_kg)),
        fob: mca ? r2(mca.fob) : r2(num(inv.fob_usd)),
        kind: inv.kind_name ?? '',
        transport_mode: inv.transport_mode_name ?? '',
        payment_method: inv.payment_method ?? '',
        scelle_qty: scelleQty,
        scelle_amount: r2(scelleAmount / cnt),
        frais_tresco: r2(fraisTresco / cnt),
        decl_ref: mca?.declaration_reference ?? '',
        decl_date: d(mca?.dgda_in_date),
        liq_ref: mca?.liquidation_reference ?? '',
        liq_date: d(mca?.liquidation_date),
        quit_ref: mca?.quittance_reference ?? '',
        quit_date: d(mca?.quittance_date),
        facture_no: factureNo,
        inv_date: invDate,
        dossiers,
        po_ref: inv.po_ref ?? 'N/A',
        liq_amt_cdf: showLiq ? r2(liqAmtCdf / cnt) : 0,
        rate_bcc: showLiq ? rateCdf : 0,
        liq_amt_usd: showLiq ? liqUsdPer : 0,
        other_charges: r2(otherCharges / cnt),
        other_tva: r2(otherChargesTva / cnt),
        other_total: otherTotalPer,
        frais_bancaires: r2(fraisBancaires / cnt),
        fb_tva: r2(fraisBancairesTva / cnt),
        operational: showOpsAgency ? r2(operational / cnt) : 0,
        op_tva: showOpsAgency ? r2(operationalTva / cnt) : 0,
        op_total: showOpsAgency ? opTotalPer : 0,
        agency: showOpsAgency ? r2(agency / cnt) : 0,
        agency_tva: showOpsAgency ? r2(agencyTva / cnt) : 0,
        agency_total: showOpsAgency ? agencyTotalPer : 0,
        total_invoice: totalInvoice,
        status: statusText(profile, validated),
      });
    };

    if (mcas.length) mcas.forEach((m) => emitRow(m));
    else emitRow(null);
  }

  const title = profile === 'debit' ? 'Debit Note' : profile === 'invoice' ? 'Invoice' : 'Full Export';
  return buildXlsx([{ name: title, columns: COLUMNS, rows }]);
}
