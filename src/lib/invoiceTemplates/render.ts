import { formatDate } from '@/lib/formatDate';
import { headingFor, type GridKey } from '@/lib/invoiceGrid/columns';
import {
  resolveOptions,
  type InvoiceDoc,
  type InvoiceLine,
  type InvoiceTemplate,
} from './types';

// The ONE invoice renderer (§4.10).
//
// The master's live preview and the printed facture both call `renderInvoice`,
// so the document an operator approves while configuring a template is the
// document the client receives. A second "preview" renderer would drift from
// the real one, and the drift would only surface on a facture already sent.
//
// §6 — every generated PDF renders borders on ALL tables. Both layouts set
// `border-collapse` plus a solid 1px border on every th/td, and restate it
// under `@media print` alongside `print-color-adjust: exact` so borders and
// fills survive the PDF step. The modern layout's reference design was
// borderless; it is drawn with thin accent-tinted rules instead, which keeps
// the look and keeps the rule.

const esc = (v: unknown): string =>
  String(v ?? '').replace(
    /[&<>"']/gu,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] as string,
  );

/** Escaped, with newlines turned into breaks — for the address and terms blocks. */
const escLines = (v: unknown): string => esc(v).replace(/\r?\n/gu, '<br>');

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmt = (v: unknown): string => formatDate(v, '');

/**
 * A translucent wash of the accent, for tinted table rows.
 *
 * Computed from the configured hex rather than being a second option: an
 * operator picking one colour should not also have to pick a matching tint, and
 * two independent colours is how a template ends up looking wrong.
 */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * White or near-black, whichever is readable on the accent.
 *
 * A pale accent with white text on it is an unreadable header, and the operator
 * choosing the colour cannot be expected to work out the contrast — so the
 * renderer does. Rec. 601 luma, the usual threshold.
 */
function readableOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
}

/**
 * One column's heading for this document, from the headings master.
 *
 * `cdf` selects the column SET rather than the caller naming it: the two sets
 * share keys (`description`, `unit`, `total_usd`), so a caller picking the set
 * by hand could read a CDF heading onto a USD column and nothing would say so.
 */
function headingReader(doc: InvoiceDoc): (cdf: boolean, columnKey: string) => string {
  return (cdf, columnKey) => {
    const grid: GridKey = cdf ? 'import-cdf' : 'import-usd';
    return headingFor(grid, columnKey, doc.headings?.[grid]);
  };
}

interface Group {
  header: string;
  cdf: boolean;
  lines: InvoiceLine[];
}

function groupLines(doc: InvoiceDoc): Group[] {
  const cdf = new Set(doc.cdf_category_ids);
  const map = new Map<number, Group>();
  for (const l of doc.lines) {
    if (!map.has(l.category_id)) {
      map.set(l.category_id, {
        header: l.category_header,
        cdf: cdf.has(l.category_id),
        lines: [],
      });
    }
    map.get(l.category_id)!.lines.push(l);
  }
  return [...map.values()];
}

interface Totals {
  sub: number;
  tva: number;
  grand: number;
  equivCdf: number;
}

function totals(doc: InvoiceDoc): Totals {
  const sub = doc.lines.reduce((s, l) => s + l.subtotal_usd, 0);
  const tva = doc.lines.reduce((s, l) => s + l.tva_usd, 0);
  const grand = sub + tva;
  return { sub, tva, grand, equivCdf: grand * (doc.rate_inv || 0) };
}

function statusBadge(validated: number): string {
  return validated === 2 ? 'DGI VERIFIED' : validated === 1 ? 'VALIDATED' : 'NOT VALIDATED';
}

// ── Classic ────────────────────────────────────────────────────────────────

function classicBody(doc: InvoiceDoc, o: ReturnType<typeof resolveOptions>): string {
  const t = totals(doc);
  const groups = groupLines(doc);
  const h = headingReader(doc);

  const categories = groups
    .map((g) => {
      // The same headings the editable grid shows, from the same master — a
      // column renamed there is renamed on the document the client receives.
      const head = g.cdf
        ? `<tr class="g"><th>${esc(h(true, 'description'))}</th><th>${esc(h(true, 'unit'))}</th><th class="r">${esc(h(true, 'rate_cdf'))}</th><th class="r">${esc(h(true, 'vat_cdf'))}</th><th class="r">${esc(h(true, 'total_cdf'))}</th></tr>`
        : `<tr class="g"><th>${esc(h(false, 'description'))}</th><th>${esc(h(false, 'unit'))}</th><th class="r">${esc(h(false, 'quantity'))}</th><th class="r">${esc(h(false, 'taux_usd'))}</th><th class="r">${esc(h(false, 'tva_usd'))}</th><th class="r">${esc(h(false, 'total_usd'))}</th></tr>`;
      const span = g.cdf ? 4 : 5;
      const rows = g.lines
        .map((l) =>
          g.cdf
            ? `<tr><td>${esc(l.item_name)}</td><td class="c">${esc(l.unit)}</td><td class="r">${money(l.rate_cdf)}</td><td class="r">${money(l.vat_cdf)}</td><td class="r">${money(l.total_cdf)}</td></tr>`
            : `<tr><td>${esc(l.item_name)}</td><td class="c">${esc(l.unit)}</td><td class="r">${money(l.quantity)}</td><td class="r">${money(l.taux_usd)}</td><td class="r">${money(l.tva_usd)}</td><td class="r">${money(l.total_usd)}</td></tr>`,
        )
        .join('');
      const cSub = g.lines.reduce((s, l) => s + (g.cdf ? l.total_cdf : l.subtotal_usd + l.tva_usd), 0);
      const header = o.showCategoryHeaders ? `<div class="cat">${esc(g.header)}</div>` : '';
      return `${header}<table class="items">${head}${rows}<tr class="g bo"><td colspan="${span}" class="r">Sub Total</td><td class="r">${money(cSub)}</td></tr></table>`;
    })
    .join('');

  const signature =
    o.showSignature && doc.validated >= 1 && doc.signature_image
      ? `<div style="text-align:right;margin-top:12px;"><img src="${esc(doc.signature_image)}" style="max-height:60px;max-width:190px;" alt="Signature"><div style="font-size:10px;margin-top:2px;">Opérateur: ${esc(doc.operator_name)}</div></div>`
      : '';

  const cifRows = o.showCifPanel
    ? `<tr><td class="k">Poids (Kg)</td><td>${money(doc.poids_kg)}</td></tr>
       <tr><td class="k">CIF/USD</td><td>${money(doc.cif_usd)}</td></tr>
       <tr><td class="k">CIF/CDF</td><td>${money(doc.cif_cdf)}</td></tr>`
    : '';

  return `
<div class="doc">
<div class="hdr"><div><div class="co">${esc(doc.company_name)}</div>${o.tagline ? `<div class="tag">${esc(o.tagline)}</div>` : ''}</div>
<div class="addr">${escLines(o.companyAddress)}</div></div>
<span class="title">${esc(o.title)}</span><span class="badge">${statusBadge(doc.validated)}</span>
<div class="meta">
  <table>
    <tr><td class="k" colspan="2" style="text-align:center;background:#e0e0e0;">CLIENT</td></tr>
    <tr><td colspan="2"><b>${esc(doc.client_name)}</b><br>${esc(doc.address)}</td></tr>
    <tr><td class="k">No. RCCM</td><td>${esc(doc.rccm_number)}</td></tr>
    <tr><td class="k">No. NIF</td><td>${esc(doc.nif_number)}</td></tr>
    <tr><td class="k">No. IDN</td><td>${esc(doc.id_nat_number)}</td></tr>
    ${cifRows}
  </table>
  <table>
    <tr><td class="k">${esc(o.title)} N°</td><td><b>${esc(doc.invoice_ref)}</b></td></tr>
    <tr><td class="k">Date</td><td>${fmt(doc.created_at)}</td></tr>
    <tr><td class="k">Transport</td><td>${esc(doc.transport_mode_name)}</td></tr>
    <tr><td class="k">Produit</td><td>${esc(doc.produit)}</td></tr>
    <tr><td class="k">License</td><td>${esc(doc.license_number)}</td></tr>
    <tr><td class="k">Declaration</td><td>${esc(doc.declaration_no)} ${fmt(doc.declaration_date)}</td></tr>
    <tr><td class="k">Liquidation</td><td>${esc(doc.liquidation_no)} ${fmt(doc.liquidation_date)}</td></tr>
    <tr><td class="k">Quittance</td><td>${esc(doc.quittance_no)} ${fmt(doc.quittance_date)}</td></tr>
    <tr><td class="k">Rate BCC / Inv</td><td>${money(doc.rate_bcc)} / ${money(doc.rate_inv)}</td></tr>
  </table>
</div>
${categories || '<p style="text-align:center;color:#888;margin:20px;">No items on this invoice.</p>'}
<table class="tot">
  <tr><td class="lbl">Total excl. TVA</td><td class="r">$ ${money(t.sub)}</td></tr>
  <tr><td class="lbl">TVA 16%</td><td class="r">$ ${money(t.tva)}</td></tr>
  <tr><td class="lbl bo">Grand Total</td><td class="r bo">$ ${money(t.grand)}</td></tr>
  <tr><td class="lbl">Equivalent CDF</td><td class="r">${money(t.equivCdf)} FC</td></tr>
</table>
${o.termsText ? `<div class="terms"><b>Terms &amp; Conditions</b><br>${escLines(o.termsText)}</div>` : ''}
${signature}
${o.showPaymentInfo ? `<div style="margin-top:8px;font-size:10px;"><b>Mode de paiement:</b> ${esc(doc.payment_method)} &nbsp;·&nbsp; <b>Taux:</b> 1 USD = ${money(doc.rate_inv)} CDF</div>` : ''}
<div class="foot">${esc(o.footerText)}</div>
</div>`;
}

function classicStyles(o: ReturnType<typeof resolveOptions>): string {
  const accent = o.accentColor;
  return `
.doc{border:2px solid #000;padding:12px;}
table{border-collapse:collapse;width:100%;border:1px solid #000;} th,td{border:1px solid #000 !important;}
.hdr{display:flex;justify-content:space-between;border-bottom:2px solid ${accent};padding-bottom:8px;margin-bottom:10px;}
.hdr .co{font-size:18px;font-weight:800;color:${accent};} .hdr .tag{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#555;}
.hdr .addr{font-size:9px;text-align:right;line-height:1.4;color:#333;}
.title{border:1px solid #111;display:inline-block;padding:3px 14px;font-weight:700;margin:8px 0;}
.meta{display:flex;gap:14px;} .meta table{width:100%;border-collapse:collapse;} .meta td{border:1px solid #000;padding:3px 5px;font-size:10px;}
.meta .k{background:#f0f0f0;font-weight:600;width:42%;}
.cat{background:${accent};color:${readableOn(accent)};font-weight:700;padding:4px 8px;margin-top:10px;text-transform:uppercase;font-size:10px;}
table.items{width:100%;border-collapse:collapse;} table.items th,table.items td{border:1px solid #000;padding:3px 6px;font-size:10px;}
.g{background:#e9ecef;} .r{text-align:right;} .c{text-align:center;} .bo{font-weight:700;}
.tot{margin-top:12px;width:45%;margin-left:auto;border-collapse:collapse;} .tot td{border:1px solid #111;padding:4px 8px;}
.tot .lbl{background:#f5f5f5;font-weight:600;text-align:right;}
.terms{margin-top:12px;font-size:10px;line-height:1.5;}
.badge{float:right;border:1px solid #000;border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;margin-top:6px;}
.foot{border:1px solid #111;text-align:center;padding:4px;margin-top:12px;font-size:10px;}`;
}

// ── Modern ─────────────────────────────────────────────────────────────────

function modernBody(doc: InvoiceDoc, o: ReturnType<typeof resolveOptions>): string {
  const t = totals(doc);
  const groups = groupLines(doc);
  const h = headingReader(doc);

  const categories = groups
    .map((g) => {
      // SL is the row number, which is the layout's own device and not a data
      // column, so it is the one heading here that is not configurable.
      const head = g.cdf
        ? `<tr><th class="sl">SL</th><th>${esc(h(true, 'description'))}</th><th class="r">${esc(h(true, 'rate_cdf'))}</th><th class="r">${esc(h(true, 'vat_cdf'))}</th><th class="r">${esc(h(true, 'total_cdf'))}</th></tr>`
        : `<tr><th class="sl">SL</th><th>${esc(h(false, 'description'))}</th><th class="r">${esc(h(false, 'taux_usd'))}</th><th class="r">${esc(h(false, 'quantity'))}</th><th class="r">${esc(h(false, 'total_usd'))}</th></tr>`;
      const rows = g.lines
        .map((l, i) => {
          const sl = String(i + 1).padStart(2, '0');
          return g.cdf
            ? `<tr><td class="sl">${sl}</td><td>${esc(l.item_name)}</td><td class="r">${money(l.rate_cdf)}</td><td class="r">${money(l.vat_cdf)}</td><td class="r">${money(l.total_cdf)}</td></tr>`
            : `<tr><td class="sl">${sl}</td><td>${esc(l.item_name)}</td><td class="r">${money(l.taux_usd)}</td><td class="r">${money(l.quantity)}</td><td class="r">${money(l.total_usd)}</td></tr>`;
        })
        .join('');
      const header = o.showCategoryHeaders ? `<div class="cat">${esc(g.header)}</div>` : '';
      return `${header}<table class="items">${head}${rows}</table>`;
    })
    .join('');

  const signature =
    o.showSignature && doc.validated >= 1 && doc.signature_image
      ? `<img src="${esc(doc.signature_image)}" alt="Signature" style="max-height:44px;max-width:170px;display:block;margin-left:auto;">`
      : '';

  const cifRows = o.showCifPanel
    ? `<tr><td class="k">Poids (Kg)</td><td class="r">${money(doc.poids_kg)}</td></tr>
       <tr><td class="k">CIF/USD</td><td class="r">${money(doc.cif_usd)}</td></tr>`
    : '';

  return `
<div class="doc">
  <div class="top">
    <div class="brand">
      <div class="co">${esc(doc.company_name)}</div>
      ${o.tagline ? `<div class="tag">${esc(o.tagline)}</div>` : ''}
    </div>
    <div class="word">${esc(o.title)}</div>
  </div>
  <div class="rule"></div><div class="rule thin"></div>

  <div class="parties">
    <table class="bill">
      <tr><td class="k" colspan="2">${esc(o.title)} To:</td></tr>
      <tr><td colspan="2"><b>${esc(doc.client_name)}</b></td></tr>
      <tr><td class="k">A</td><td>${esc(doc.address)}</td></tr>
      <tr><td class="k">RCCM</td><td>${esc(doc.rccm_number)}</td></tr>
      <tr><td class="k">NIF</td><td>${esc(doc.nif_number)}</td></tr>
      <tr><td class="k">IDN</td><td>${esc(doc.id_nat_number)}</td></tr>
    </table>
    <table class="docmeta">
      <tr><td class="k">${esc(o.title)} No</td><td class="r"><b>${esc(doc.invoice_ref)}</b></td></tr>
      <tr><td class="k">Date</td><td class="r">${fmt(doc.created_at)}</td></tr>
      <tr><td class="k">Status</td><td class="r">${statusBadge(doc.validated)}</td></tr>
      <tr><td class="k">Transport</td><td class="r">${esc(doc.transport_mode_name)}</td></tr>
      <tr><td class="k">License</td><td class="r">${esc(doc.license_number)}</td></tr>
      <tr><td class="k">Declaration</td><td class="r">${esc(doc.declaration_no)}</td></tr>
      ${cifRows}
    </table>
  </div>

  ${categories || '<p style="text-align:center;color:#888;margin:20px;">No items on this invoice.</p>'}

  <div class="lower">
    <div class="terms">
      ${o.termsText ? `<div class="th">Terms &amp; Conditions</div><div class="tb">${escLines(o.termsText)}</div>` : ''}
    </div>
    <table class="tot">
      <tr><td class="lbl">Sub Total</td><td class="r">$ ${money(t.sub)}</td></tr>
      <tr><td class="lbl">Tax – 16%</td><td class="r">$ ${money(t.tva)}</td></tr>
      <tr><td class="lbl">Equivalent CDF</td><td class="r">${money(t.equivCdf)} FC</td></tr>
      <tr class="grand"><td class="lbl">Total</td><td class="r">$ ${money(t.grand)}</td></tr>
    </table>
  </div>

  <div class="lower pay">
    <div>
      ${
        o.showPaymentInfo
          ? `<div class="th">Payment Info</div>
             <table class="payinfo">
               <tr><td class="k">Mode de paiement</td><td>${esc(doc.payment_method)}</td></tr>
               <tr><td class="k">Taux</td><td>1 USD = ${money(doc.rate_inv)} CDF</td></tr>
               <tr><td class="k">Rate BCC</td><td>${money(doc.rate_bcc)}</td></tr>
             </table>`
          : ''
      }
    </div>
    <div class="sig">
      ${signature}
      <div class="signame">${esc(doc.operator_name)}</div>
      <div class="siglbl">Signature</div>
    </div>
  </div>

  ${o.footerText ? `<div class="thanks">${esc(o.footerText)}</div>` : ''}
  <div class="strip">${o.contactLine ? escLines(o.contactLine) : escLines(o.companyAddress)}</div>
</div>`;
}

function modernStyles(o: ReturnType<typeof resolveOptions>): string {
  const accent = o.accentColor;
  const on = readableOn(accent);
  return `
.doc{border:1px solid ${tint(accent, 0.35)};padding:0 0 0 0;}
table{border-collapse:collapse;width:100%;border:1px solid ${tint(accent, 0.45)};}
th,td{border:1px solid ${tint(accent, 0.45)} !important;padding:5px 8px;font-size:10px;}
.top{display:flex;justify-content:space-between;align-items:flex-end;padding:16px 18px 10px;}
.brand .co{font-size:15px;font-weight:800;letter-spacing:.02em;}
.brand .tag{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-top:2px;}
.word{font-size:30px;font-weight:800;letter-spacing:.02em;color:${accent};line-height:1;}
.rule{height:7px;background:${accent};} .rule.thin{height:3px;margin-top:2px;}
.parties{display:flex;gap:14px;padding:14px 18px 0;}
.parties table{width:100%;}
.bill .k,.docmeta .k{font-weight:600;color:${accent};width:34%;}
.docmeta .k{color:#333;}
.cat{margin:14px 18px 0;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.08em;color:${accent};}
table.items{width:calc(100% - 36px);margin:6px 18px 0;}
table.items th{background:${accent};color:${on};font-weight:700;text-align:left;}
table.items th.r,table.items td.r{text-align:right;}
table.items th.sl,table.items td.sl{width:34px;text-align:center;}
/* Zebra rows are the reference design's look; borders stay for §6. */
table.items tr:nth-child(odd) td{background:${tint(accent, 0.1)};}
.lower{display:flex;gap:14px;padding:14px 18px 0;align-items:flex-start;}
.lower>*:first-child{flex:1;}
.th{font-weight:700;font-size:10px;margin-bottom:3px;}
.tb{font-size:9px;line-height:1.5;color:#444;}
.tot{width:46%;margin-left:auto;}
.tot .lbl{font-weight:600;} .tot .r{text-align:right;}
.tot tr.grand td{background:${accent};color:${on};font-weight:800;}
.pay .sig{text-align:right;min-width:170px;}
.pay .signame{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:13px;border-bottom:1px solid #111;padding-bottom:2px;}
.pay .siglbl{font-weight:700;font-size:10px;margin-top:2px;}
.payinfo{width:100%;} .payinfo .k{font-weight:600;width:46%;}
.thanks{text-align:center;font-size:10px;padding:12px 18px 10px;}
.strip{background:${accent};color:${on};font-size:9px;padding:8px 18px;line-height:1.5;}`;
}

// ── Entry point ────────────────────────────────────────────────────────────

/**
 * One invoice, as printable HTML.
 *
 * `interactive` adds the Print button — wanted on the /print route, and wrong
 * inside the master's preview iframe, where it is not the operator's next step.
 */
export function renderInvoice(
  doc: InvoiceDoc,
  template: InvoiceTemplate,
  opts: { interactive?: boolean } = {},
): string {
  const o = resolveOptions(template.options);
  const modern = template.layout === 'modern';

  const watermark =
    o.showWatermark && doc.validated === 0 ? '<div class="wm">NOT VALID</div>' : '';
  const printButton = opts.interactive
    ? '<div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>'
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title)} ${esc(doc.invoice_ref)}</title>
<style>
@page{size:${o.pageSize};margin:10mm;}
*{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:0;padding:18px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.wm{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:90px;color:rgba(200,0,0,.12);font-weight:800;z-index:0;pointer-events:none;}
.r{text-align:right;} .c{text-align:center;} .bo{font-weight:700;}
${modern ? modernStyles(o) : classicStyles(o)}
.noprint{margin-bottom:10px;} .btn{background:${o.accentColor};color:${readableOn(o.accentColor)};border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
/* §6 — borders and fills must survive the print/PDF step. */
@media print{.noprint{display:none;} body{padding:0;} table,th,td{border:1px solid #000 !important;}}
</style></head><body>${watermark}${printButton}${modern ? modernBody(doc, o) : classicBody(doc, o)}</body></html>`;
}
