// §2 step 5 — printable export invoice (no PDF library; self-contained HTML the
// client opens and saves as PDF). Condensed version of the legacy mPDF pages:
//   p1  = Debit Note  (reimbursable items, category ≤ 2)
//   p2  = Facture     (operational items, category ≥ 3) + MCA detail table
//   full = both
// Per §6 CLAUDE.md, every table renders solid black borders on all cells.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/formatDate';
import { loadBranding } from './branding';

const fmtDate = (v: unknown): string => formatDate(v, '');

export type PrintPage = 'full' | 'p1' | 'p2';

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
  unit_text: string;
  cost_usd: number;
  subtotal_usd: number;
  tva_usd: number;
  total_usd: number;
}

function itemsTable(header: string, items: Item[]): { html: string; sub: number; tva: number; tot: number } {
  let sub = 0;
  let tva = 0;
  let tot = 0;
  let rows = '';
  for (const it of items) {
    sub += it.subtotal_usd;
    tva += it.tva_usd;
    tot += it.total_usd;
    rows += `<tr><td>${esc(it.item_name)}</td><td class="c">${esc(it.unit_text)}</td><td class="r">${money(it.cost_usd)}</td><td class="r">${money(it.subtotal_usd)}</td><td class="r">${money(it.tva_usd)}</td><td class="r">${money(it.total_usd)}</td></tr>`;
  }
  const html = `<div class="cat">${esc(header)}</div><table class="items">
    <tr class="g"><th>Description</th><th>Unit</th><th class="r">Cost/USD</th><th class="r">Subtotal USD</th><th class="r">TVA 16%</th><th class="r">Total USD</th></tr>
    ${rows}
    <tr class="g bo"><td colspan="3" class="r">SUB-TOTAL</td><td class="r">${money(sub)}</td><td class="r">${money(tva)}</td><td class="r">${money(tot)}</td></tr>
  </table>`;
  return { html, sub, tva, tot };
}

export async function buildExportInvoicePrintHtml(id: number, page: PrintPage): Promise<string | null> {
  // §4.1 — the letterhead names the deployment, not a hardcoded company. Comes
  // from Settings → Application, the same source as the app's own branding.
  const companyName = (await loadBranding()).project_name;
  const invRes = await db.execute(sql`
    SELECT inv.*, c.company_name, c.short_name, c.address, c.rccm_number, c.nif_number, c.id_nat_number,
           l.license_number, tg.goods_type, tm.transport_mode_name,
           su.signature_image AS sig_image, COALESCE(su.full_name, su.username) AS operator_name
    FROM export_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN license_t l ON l.id = inv.license_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = inv.transport_mode_id
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
           eii.unit_text, eii.cost_usd, eii.subtotal_usd, eii.tva_usd, eii.total_usd,
           eii.display_order, eii.id
    FROM export_invoice_items_t eii
    LEFT JOIN item_master_t im
      ON im.id = COALESCE(eii.item_id, CASE WHEN eii.item_name ~ '^[0-9]+$' THEN eii.item_name::int END)
    LEFT JOIN quotation_category_master_t qc ON qc.id = COALESCE(eii.category_id, im.category_id)
    WHERE eii.export_invoice_id = ${id}
    ORDER BY eii.display_order ASC, category_id ASC, eii.id ASC`);
  const items: Item[] = (itemsRes as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    category_id: num(r.category_id),
    category_header: String(r.category_header ?? 'UNCATEGORIZED'),
    item_name: String(r.item_name ?? ''),
    unit_text: String(r.unit_text ?? 'Unit'),
    cost_usd: num(r.cost_usd),
    subtotal_usd: num(r.subtotal_usd),
    tva_usd: num(r.tva_usd),
    total_usd: num(r.total_usd),
  }));

  const mcaRes = await db.execute(sql`
    SELECT eimd.*, e.mca_ref
    FROM export_invoice_mca_details_t eimd LEFT JOIN exports_t e ON e.id = eimd.mca_id
    WHERE eimd.export_invoice_id = ${id} ORDER BY eimd.display_order ASC, eimd.id ASC`);
  const mcas = (mcaRes as unknown as { rows: Record<string, unknown>[] }).rows;

  // group items by category, split into reimbursable (≤2) and facture (≥3)
  const groups = new Map<number, { header: string; items: Item[] }>();
  for (const it of items) {
    if (!groups.has(it.category_id)) groups.set(it.category_id, { header: it.category_header, items: [] });
    groups.get(it.category_id)!.items.push(it);
  }
  const reimbursable = [...groups.entries()].filter(([c]) => c <= 2).sort((a, b) => a[0] - b[0]);
  const facture = [...groups.entries()].filter(([c]) => c >= 3).sort((a, b) => a[0] - b[0]);

  const validated = num(inv.validated);
  const statusBadge = validated === 2 ? 'DGI VERIFIED' : validated === 1 ? 'VALIDATED' : 'NOT VALIDATED';
  const watermark = validated === 0 ? '<div class="wm">NOT VALID</div>' : '';
  // Operator signature — only on a validated invoice, and only if the creator has one.
  const signatureHtml =
    validated >= 1 && inv.sig_image
      ? `<div style="text-align:right;margin-top:12px;"><img src="${esc(inv.sig_image)}" style="max-height:60px;max-width:190px;" alt="Signature"><div style="font-size:10px;margin-top:2px;">Opérateur: ${esc(inv.operator_name)}</div></div>`
      : '';

  const infoBoxes = (label: string, factureRef: string): string => `
    <div class="meta">
      <table>
        <tr><td class="k" colspan="2" style="text-align:center;background:#e0e0e0;">CLIENT</td></tr>
        <tr><td colspan="2"><b>${esc(inv.company_name)}</b><br>${esc(inv.address)}</td></tr>
        <tr><td class="k">No. RCCM</td><td>${esc(inv.rccm_number)}</td></tr>
        <tr><td class="k">No. NIF</td><td>${esc(inv.nif_number)}</td></tr>
        <tr><td class="k">No. IDN</td><td>${esc(inv.id_nat_number)}</td></tr>
        <tr><td class="k">License</td><td>${esc(inv.license_number)}</td></tr>
      </table>
      <table>
        <tr><td class="k">${label}</td><td><b>${esc(factureRef)}</b></td></tr>
        <tr><td class="k">Date</td><td>${fmtDate(inv.invoice_date)}</td></tr>
        <tr><td class="k">Transport</td><td>${esc(inv.transport_mode_name)}</td></tr>
        <tr><td class="k">Type of Goods</td><td>${esc(inv.goods_type)}</td></tr>
        <tr><td class="k">Nombre de Dossier(s)</td><td>${mcas.length}</td></tr>
        <tr><td class="k">Total Weight (Mt)</td><td>${money(num(inv.total_weight))}</td></tr>
      </table>
    </div>`;

  const totalsBlock = (sub: number, tva: number): string => {
    const grand = sub + tva;
    return `<table class="tot">
      <tr><td class="lbl">Total excl. TVA</td><td class="r">$ ${money(sub)}</td></tr>
      <tr><td class="lbl">TVA 16%</td><td class="r">$ ${money(tva)}</td></tr>
      <tr><td class="lbl bo">Grand Total</td><td class="r bo">$ ${money(grand)}</td></tr>
    </table>`;
  };

  // Debit Note section
  let dn = '';
  if (page === 'full' || page === 'p1') {
    dn += `<div class="doc-title">DEBIT NOTE</div>`;
    dn += infoBoxes('DEBIT NOTE', 'ND-' + String(inv.invoice_ref ?? ''));
    dn += `<div class="rc">REIMBURSABLE CHARGES</div>`;
    let sub = 0;
    let tva = 0;
    for (const [, g] of reimbursable) {
      const t = itemsTable(g.header, g.items);
      dn += t.html;
      sub += t.sub;
      tva += t.tva;
    }
    if (!reimbursable.length) dn += `<p class="empty">No reimbursable items.</p>`;
    dn += totalsBlock(sub, tva);
    dn += signatureHtml;
  }

  // Facture section
  let fac = '';
  if (page === 'full' || page === 'p2') {
    if (page === 'full') fac += `<div class="pagebreak"></div>`;
    fac += `<div class="doc-title">FACTURE</div>`;
    fac += infoBoxes('N. FACTURE', String(inv.invoice_ref ?? ''));
    let sub = 0;
    let tva = 0;
    for (const [, g] of facture) {
      const t = itemsTable(g.header, g.items);
      fac += t.html;
      sub += t.sub;
      tva += t.tva;
    }
    if (!facture.length) fac += `<p class="empty">No operational items.</p>`;
    fac += totalsBlock(sub, tva);
    fac += signatureHtml;

    // MCA financial detail table
    if (mcas.length) {
      let rows = '';
      let tQty = 0;
      let tCdf = 0;
      let tUsd = 0;
      mcas.forEach((m, i) => {
        const w = num(m.weight);
        const rate = num(m.bcc_rate) || 2500;
        const cdf = num(m.liquidation_amount);
        const usd = rate > 0 ? cdf / rate : 0;
        tQty += w;
        tCdf += cdf;
        tUsd += usd;
        rows += `<tr><td class="c">${i + 1}</td><td>${esc(m.mca_ref)}</td><td class="r">${money(w)}</td><td>${esc(m.declaration_no)}</td><td class="c">${fmtDate(m.declaration_date)}</td><td>${esc(m.liquidation_no)}</td><td class="c">${fmtDate(m.liquidation_date)}</td><td class="r">${money(cdf)}</td><td class="r">${money(rate)}</td><td class="r">${money(usd)}</td></tr>`;
      });
      fac += `<div class="cat" style="margin-top:12px;">MCA DETAILS</div><table class="items">
        <tr class="g"><th>#</th><th>MCA File</th><th class="r">Qty(Mt)</th><th>Decl. Ref</th><th>Decl. Date</th><th>Liq. Ref</th><th>Liq. Date</th><th class="r">Liq. CDF</th><th class="r">Rate</th><th class="r">Liq. USD</th></tr>
        ${rows}
        <tr class="g bo"><td colspan="2" class="r">Total</td><td class="r">${money(tQty)}</td><td colspan="4"></td><td class="r">${money(tCdf)}</td><td></td><td class="r">${money(tUsd)}</td></tr>
      </table>`;
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Export Invoice ${esc(inv.invoice_ref)}</title>
<style>
*{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:0;padding:18px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.doc{border:2px solid #000;padding:12px;}
/* borders on every table + cell — required for all generated PDF/print output */
table{border-collapse:collapse;width:100%;border:1px solid #000;} th,td{border:1px solid #000 !important;}
.wm{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:90px;color:rgba(200,0,0,.12);font-weight:800;z-index:0;pointer-events:none;}
.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px;}
.hdr .co{font-size:18px;font-weight:800;} .hdr .addr{font-size:9px;text-align:right;line-height:1.4;color:#333;}
.doc-title{border:1px solid #000;display:inline-block;padding:4px 16px;font-weight:700;font-size:14px;margin:8px 0;}
.badge{float:right;border:1px solid #000;border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;margin-top:6px;}
.meta{display:flex;gap:14px;margin-bottom:6px;} .meta table{width:100%;} .meta td{padding:3px 5px;font-size:10px;}
.meta .k{background:#f0f0f0;font-weight:600;width:42%;}
.rc{text-align:center;font-weight:700;font-size:11px;margin:8px 0;text-transform:uppercase;}
.cat{background:#111;color:#fff;font-weight:700;padding:4px 8px;margin-top:10px;text-transform:uppercase;font-size:10px;border:1px solid #000;}
table.items th,table.items td{padding:3px 6px;font-size:10px;}
.g{background:#e9ecef;} .r{text-align:right;} .c{text-align:center;} .bo{font-weight:700;}
.tot{margin-top:12px;width:45%;margin-left:auto;} .tot td{padding:4px 8px;} .tot .lbl{background:#f5f5f5;font-weight:600;text-align:right;}
.foot{border:1px solid #000;text-align:center;padding:4px;margin-top:12px;font-size:10px;}
.empty{text-align:center;color:#888;margin:14px;}
.pagebreak{page-break-before:always;height:8px;}
@media print{.noprint{display:none;} body{padding:6px;} .doc{border:2px solid #000;} table,th,td{border:1px solid #000 !important;}}
.noprint{margin-bottom:10px;} .btn{background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
</style></head><body>${watermark}
<div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
<div class="doc">
<div class="hdr"><div><div class="co">${esc(companyName)}</div></div>
<div class="addr">No. 1068, Avenue Ruwe, Quartier Makutano,<br>Lubumbashi, DRC<br>RCCM: 13-B-1122 · NIF: A 1309334 L</div></div>
<span class="badge">${statusBadge}</span>
${dn}
${fac}
<div class="foot">Thank you for your business!</div>
</div>
</body></html>`;
}
