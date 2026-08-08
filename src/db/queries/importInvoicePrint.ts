// §2 step 5 — printable import invoice. No PDF library is installed, so we render
// a self-contained printable HTML document (the client opens it in a new tab and
// uses the browser's "Save as PDF"). This is a faithful-but-condensed version of
// the legacy mPDF facture: header + client/financial block + per-category item
// tables + totals. Category buckets: 1 = reimbursable (CDF), 2/3/4 = USD.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/formatDate';

const fmtDate = (v: unknown): string => formatDate(v, '');

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] as string));

interface Item {
  category_id: number;
  category_header: string;
  item_name: string;
  unit: string;
  quantity: number;
  taux_usd: number;
  subtotal_usd: number;
  tva_usd: number;
  total_usd: number;
  rate_cdf: number;
  vat_cdf: number;
  total_cdf: number;
}

export async function buildImportInvoicePrintHtml(id: number): Promise<string | null> {
  const invRes = await db.execute(sql`
    SELECT inv.*, c.company_name, c.short_name, c.address, c.rccm_number, c.nif_number,
           c.id_nat_number, c.import_export_number,
           tm.transport_mode_name, tg.goods_type, l.license_number,
           su.signature_image AS sig_image, COALESCE(su.full_name, su.username) AS operator_name
    FROM import_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = inv.transport_mode_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN license_t l ON l.id = inv.license_id
    LEFT JOIN users_t su ON su.id = inv.created_by
    WHERE inv.id = ${id} AND inv.display = 'Y' LIMIT 1`);
  const inv = (invRes as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!inv) return null;

  // Resolve the display name + category from item_master_t so legacy rows that
  // stored the item id in item_name (and left item_id / category null) still
  // print the real name and a proper category header. Effective item id =
  // item_id, else a purely-numeric item_name; category = the row's category_id
  // else the resolved item's category. Stored text still wins when a real name
  // was typed with no master link (im.* is null → COALESCE falls through).
  const itemsRes = await db.execute(sql`
    SELECT COALESCE(eii.category_id, im.category_id) AS category_id,
           COALESCE(eii.category_header, eii.category_name, qc.category_header, qc.category_name, 'UNCATEGORIZED') AS category_header,
           COALESCE(im.item_name, NULLIF(eii.item_name, '')) AS item_name,
           eii.unit_text, eii.unit_name, eii.quantity, eii.taux_usd, eii.subtotal_usd,
           eii.tva_usd, eii.total_usd, eii.rate_cdf, eii.vat_cdf, eii.total_cdf,
           eii.sort_order, eii.id
    FROM import_invoice_items_t eii
    LEFT JOIN item_master_t im
      ON im.id = COALESCE(eii.item_id, CASE WHEN eii.item_name ~ '^[0-9]+$' THEN eii.item_name::int END)
    LEFT JOIN quotation_category_master_t qc ON qc.id = COALESCE(eii.category_id, im.category_id)
    WHERE eii.invoice_id = ${id} AND eii.display = 'Y'
    ORDER BY category_id ASC, eii.sort_order ASC, eii.id ASC`);
  const items: Item[] = (itemsRes as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    category_id: num(r.category_id),
    category_header: String(r.category_header ?? 'UNCATEGORIZED'),
    item_name: String(r.item_name ?? ''),
    unit: String(r.unit_text ?? r.unit_name ?? 'Unit'),
    quantity: num(r.quantity),
    taux_usd: num(r.taux_usd),
    subtotal_usd: num(r.subtotal_usd),
    tva_usd: num(r.tva_usd),
    total_usd: num(r.total_usd),
    rate_cdf: num(r.rate_cdf),
    vat_cdf: num(r.vat_cdf),
    total_cdf: num(r.total_cdf),
  }));

  const rateBcc = num(inv.rate_cdf_usd_bcc) || 2500;
  const rateInv = num(inv.rate_cdf_inv) || 2500;
  const validated = num(inv.validated);

  // group by category
  const groups = new Map<number, { header: string; items: Item[] }>();
  for (const it of items) {
    if (!groups.has(it.category_id)) groups.set(it.category_id, { header: it.category_header, items: [] });
    groups.get(it.category_id)!.items.push(it);
  }

  let grandSub = 0;
  let grandTva = 0;
  let categoriesHtml = '';
  for (const [catId, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const isCat1 = catId === 1;
    let rowsHtml = '';
    let cSub = 0;
    let cTva = 0;
    for (const it of g.items) {
      let sub: number;
      let tva: number;
      if (isCat1) {
        sub = rateBcc > 0 ? it.rate_cdf / rateBcc : 0;
        tva = rateBcc > 0 ? it.vat_cdf / rateBcc : 0;
      } else {
        sub = it.subtotal_usd || it.quantity * it.taux_usd;
        tva = it.tva_usd;
      }
      cSub += sub;
      cTva += tva;
      if (isCat1) {
        rowsHtml += `<tr><td>${esc(it.item_name)}</td><td class="c">${esc(it.unit)}</td><td class="r">${money(it.rate_cdf)}</td><td class="r">${money(it.vat_cdf)}</td><td class="r">${money(it.total_cdf)}</td></tr>`;
      } else {
        rowsHtml += `<tr><td>${esc(it.item_name)}</td><td class="c">${esc(it.unit)}</td><td class="r">${money(it.quantity)}</td><td class="r">${money(it.taux_usd)}</td><td class="r">${money(tva)}</td><td class="r">${money(sub + tva)}</td></tr>`;
      }
    }
    grandSub += cSub;
    grandTva += cTva;
    const head = isCat1
      ? '<tr class="g"><th>Description</th><th>Unit</th><th class="r">Rate/CDF</th><th class="r">TVA/CDF</th><th class="r">Total/CDF</th></tr>'
      : '<tr class="g"><th>Description</th><th>Unit</th><th class="r">Qty</th><th class="r">Taux/USD</th><th class="r">TVA/USD</th><th class="r">Total/USD</th></tr>';
    const subLabel = isCat1 ? 'Sub-total (USD equiv.)' : 'Sub-total (USD)';
    const span = isCat1 ? 4 : 5;
    categoriesHtml += `<div class="cat">${esc(g.header)}</div><table class="items">${head}${rowsHtml}<tr class="g bo"><td colspan="${span}" class="r">${subLabel}</td><td class="r">${money(cSub + cTva)}</td></tr></table>`;
  }

  const grand = grandSub + grandTva;
  const equivCdf = grand * rateInv;
  const statusBadge =
    validated === 2 ? 'DGI VERIFIED' : validated === 1 ? 'VALIDATED' : 'NOT VALIDATED';
  const watermark = validated === 0 ? '<div class="wm">NOT VALID</div>' : '';
  // Operator signature — only on a validated invoice, and only if the creator has one.
  const signatureHtml =
    validated >= 1 && inv.sig_image
      ? `<div style="text-align:right;margin-top:12px;"><img src="${esc(inv.sig_image)}" style="max-height:60px;max-width:190px;" alt="Signature"><div style="font-size:10px;margin-top:2px;">Opérateur: ${esc(inv.operator_name)}</div></div>`
      : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.invoice_ref)}</title>
<style>
*{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:0;padding:18px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.doc{border:2px solid #000;padding:12px;}
/* borders on every table + every cell — required for all generated PDF/print output */
table{border-collapse:collapse;width:100%;border:1px solid #000;} th,td{border:1px solid #000 !important;}
.wm{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:90px;color:rgba(200,0,0,.12);font-weight:800;z-index:0;pointer-events:none;}
.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px;}
.hdr .co{font-size:18px;font-weight:800;} .hdr .addr{font-size:9px;text-align:right;line-height:1.4;color:#333;}
.title{border:1px solid #111;display:inline-block;padding:3px 14px;font-weight:700;margin:8px 0;}
.meta{display:flex;gap:14px;} .meta table{width:100%;border-collapse:collapse;} .meta td{border:1px solid #000;padding:3px 5px;font-size:10px;}
.meta .k{background:#f0f0f0;font-weight:600;width:42%;}
.cat{background:#111;color:#fff;font-weight:700;padding:4px 8px;margin-top:10px;text-transform:uppercase;font-size:10px;}
table.items{width:100%;border-collapse:collapse;} table.items th,table.items td{border:1px solid #000;padding:3px 6px;font-size:10px;}
.g{background:#e9ecef;} .r{text-align:right;} .c{text-align:center;} .bo{font-weight:700;}
.tot{margin-top:12px;width:45%;margin-left:auto;border-collapse:collapse;} .tot td{border:1px solid #111;padding:4px 8px;}
.tot .lbl{background:#f5f5f5;font-weight:600;text-align:right;}
.badge{float:right;border:1px solid #000;border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;margin-top:6px;}
.foot{border:1px solid #111;text-align:center;padding:4px;margin-top:12px;font-size:10px;}
@media print{.noprint{display:none;} body{padding:6px;} .doc{border:2px solid #000;} table,th,td{border:1px solid #000 !important;}}
.noprint{margin-bottom:10px;} .btn{background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
</style></head><body>${watermark}
<div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
<div class="doc">
<div class="hdr"><div><div class="co">MALABAR RDC SARL</div></div>
<div class="addr">No. 1068, Avenue Ruwe, Quartier Makutano,<br>Lubumbashi, DRC<br>RCCM: 13-B-1122 · NIF: A 1309334 L</div></div>
<span class="title">FACTURE</span><span class="badge">${statusBadge}</span>
<div class="meta">
  <table>
    <tr><td class="k" colspan="2" style="text-align:center;background:#e0e0e0;">CLIENT</td></tr>
    <tr><td colspan="2"><b>${esc(inv.company_name)}</b><br>${esc(inv.address)}</td></tr>
    <tr><td class="k">No. RCCM</td><td>${esc(inv.rccm_number)}</td></tr>
    <tr><td class="k">No. NIF</td><td>${esc(inv.nif_number)}</td></tr>
    <tr><td class="k">No. IDN</td><td>${esc(inv.id_nat_number)}</td></tr>
    <tr><td class="k">Poids (Kg)</td><td>${money(num(inv.poids_kg))}</td></tr>
    <tr><td class="k">CIF/USD</td><td>${money(num(inv.cif_usd))}</td></tr>
    <tr><td class="k">CIF/CDF</td><td>${money(num(inv.cif_cdf))}</td></tr>
  </table>
  <table>
    <tr><td class="k">FACTURE N°</td><td><b>${esc(inv.invoice_ref)}</b></td></tr>
    <tr><td class="k">Date</td><td>${fmtDate(inv.created_at)}</td></tr>
    <tr><td class="k">Transport</td><td>${esc(inv.transport_mode_name)}</td></tr>
    <tr><td class="k">Produit</td><td>${esc(inv.produit)}</td></tr>
    <tr><td class="k">License</td><td>${esc(inv.license_number)}</td></tr>
    <tr><td class="k">Declaration</td><td>${esc(inv.declaration_no)} ${fmtDate(inv.declaration_date)}</td></tr>
    <tr><td class="k">Liquidation</td><td>${esc(inv.liquidation_no)} ${fmtDate(inv.liquidation_date)}</td></tr>
    <tr><td class="k">Quittance</td><td>${esc(inv.quittance_no)} ${fmtDate(inv.quittance_date)}</td></tr>
    <tr><td class="k">Rate BCC / Inv</td><td>${money(rateBcc)} / ${money(rateInv)}</td></tr>
  </table>
</div>
${categoriesHtml || '<p style="text-align:center;color:#888;margin:20px;">No items on this invoice.</p>'}
<table class="tot">
  <tr><td class="lbl">Total excl. TVA</td><td class="r">$ ${money(grandSub)}</td></tr>
  <tr><td class="lbl">TVA 16%</td><td class="r">$ ${money(grandTva)}</td></tr>
  <tr><td class="lbl bo">Grand Total</td><td class="r bo">$ ${money(grand)}</td></tr>
  <tr><td class="lbl">Equivalent CDF</td><td class="r">${money(equivCdf)} FC</td></tr>
</table>
${signatureHtml}
<div style="margin-top:8px;font-size:10px;"><b>Mode de paiement:</b> ${esc(inv.payment_method)} &nbsp;·&nbsp; <b>Taux:</b> 1 USD = ${money(rateInv)} CDF</div>
<div class="foot">Thank you for your business!</div>
</div>
</body></html>`;
}
